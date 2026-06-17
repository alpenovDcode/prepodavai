import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { RRule } from 'rrule';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EmailService } from '../../common/services/email.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TelegramService } from '../telegram/telegram.service';
import { MaxService } from '../max/max.service';

/**
 * Cron-сервис напоминаний о событиях календаря.
 *
 * Тикает каждые 5 минут. Для каждого события (включая раскрытые
 * occurrences повторяющихся серий), которое начнётся в ближайшие 25
 * часов, проверяет три маркера:
 *   • '24h'  — отправка в окне [start − 24h, start − 23h)
 *   • '1h'   — окно [start − 1h, start − 30m)
 *   • '10m'  — окно [start − 10m, start − 0)
 *
 * Каждый отправленный маркер пишется в `remindersSent` как
 * `<marker>@<isoStartOfOccurrence>` — гарантирует ровно одну отправку
 * на копию повтора (мастер не разваливается на occurrences в БД).
 *
 * Каналы: in-app (всегда), Telegram (если есть chatId), MAX (если
 * есть chatId), Email (если есть email). Падение одного канала не
 * блокирует остальные.
 */
const TICK_INTERVAL_MS = 5 * 60 * 1000;        // 5 минут
const STARTUP_DELAY_MS = 60 * 1000;            // 1 минута после старта
const WINDOW_MS = 25 * 60 * 60 * 1000;         // 25 часов вперёд

type Marker = '24h' | '1h' | '10m';

@Injectable()
export class CalendarReminderCronService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CalendarReminderCronService.name);
  private intervalRef: NodeJS.Timeout | null = null;
  private startupTimeoutRef: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly notificationsService: NotificationsService,
    private readonly telegramService: TelegramService,
    private readonly maxService: MaxService,
  ) {}

  onModuleInit() {
    this.startupTimeoutRef = setTimeout(() => {
      this.tick().catch((err) => this.logger.error(`Initial tick failed: ${err?.message}`));
      this.intervalRef = setInterval(() => {
        this.tick().catch((err) => this.logger.error(`Tick failed: ${err?.message}`));
      }, TICK_INTERVAL_MS);
    }, STARTUP_DELAY_MS);
  }

  onModuleDestroy() {
    if (this.startupTimeoutRef) clearTimeout(this.startupTimeoutRef);
    if (this.intervalRef) clearInterval(this.intervalRef);
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const now = new Date();
      const horizon = new Date(now.getTime() + WINDOW_MS);

      // Кандидаты — все события с потенциально предстоящим стартом:
      // одиночные с startAt в окне или любые с rrule (раскроем сами).
      // status='cancelled' пропускаем — отменённое не напоминаем.
      const candidates = await this.prisma.calendarEvent.findMany({
        where: {
          status: { not: 'cancelled' },
          OR: [
            { startAt: { gte: now, lte: horizon } },
            { recurrenceRuleId: { not: null } },
          ],
        },
        include: {
          user: { select: { id: true, firstName: true, telegramChatId: true, maxChatId: true, email: true } },
          student: { select: { id: true, name: true } },
          recurrenceRule: { select: { rrule: true } },
        },
      });

      let sent = 0;
      for (const ev of candidates) {
        const occurrences = this.computeOccurrences(ev, now, horizon);
        for (const occStart of occurrences) {
          const newMarkers: Marker[] = [];
          for (const marker of ['24h', '1h', '10m'] as Marker[]) {
            if (this.shouldFire(occStart, now, marker)) {
              const key = `${marker}@${occStart.toISOString()}`;
              if (!(ev.remindersSent || []).includes(key)) {
                newMarkers.push(marker);
              }
            }
          }
          if (newMarkers.length === 0) continue;

          for (const marker of newMarkers) {
            try {
              await this.deliver(ev, occStart, marker);
              await this.prisma.calendarEvent.update({
                where: { id: ev.id },
                data: { remindersSent: { push: `${marker}@${occStart.toISOString()}` } },
              });
              sent++;
            } catch (err: any) {
              this.logger.warn(`Reminder ${marker} for ${ev.id}@${occStart.toISOString()} failed: ${err?.message}`);
            }
          }
        }
      }

      if (sent > 0) this.logger.log(`Calendar reminders sent: ${sent}`);
    } finally {
      this.running = false;
    }
  }

  private computeOccurrences(ev: any, from: Date, to: Date): Date[] {
    if (!ev.recurrenceRule) {
      if (ev.startAt >= from && ev.startAt <= to) return [ev.startAt];
      return [];
    }
    try {
      const rule = RRule.fromString(
        `DTSTART:${toIcal(ev.startAt)}\nRRULE:${ev.recurrenceRule.rrule}`,
      );
      const occs = rule.between(from, to, true);
      const excluded = new Set((ev.recurrenceExdate || []).map((d: Date) => new Date(d).getTime()));
      return occs.filter((d) => !excluded.has(d.getTime()));
    } catch {
      return [];
    }
  }

  private shouldFire(start: Date, now: Date, marker: Marker): boolean {
    const ms = start.getTime() - now.getTime();
    // Окна-фитили (немного с запасом, т.к. тик каждые 5 мин):
    if (marker === '24h') return ms <= 24 * 3600_000 && ms > 23 * 3600_000;
    if (marker === '1h')  return ms <= 60 * 60_000   && ms > 30 * 60_000;
    if (marker === '10m') return ms <= 10 * 60_000   && ms > 0;
    return false;
  }

  private async deliver(ev: any, occStart: Date, marker: Marker) {
    const user = ev.user;
    if (!user) return;
    const offset = marker === '24h' ? 'через 24 часа' : marker === '1h' ? 'через 1 час' : 'через 10 минут';
    const when = occStart.toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'long' });
    const studentTail = ev.student?.name ? ` с ${ev.student.name}` : '';

    const title = `Напоминание о событии ${offset}`;
    const text = `«${ev.title}»${studentTail} начнётся ${when} (${offset}).`;

    // In-app
    await this.notificationsService.createNotification({
      userId: user.id,
      userType: 'teacher',
      type: 'deadline_reminder',
      title,
      message: text,
      metadata: { eventId: ev.id, occurrenceStart: occStart.toISOString(), marker },
    });

    // Telegram
    if (user.telegramChatId) {
      try {
        await this.telegramService.sendBroadcastMessage(user.telegramChatId, text);
      } catch (e: any) {
        this.logger.warn(`Telegram delivery failed for ${user.id}: ${e?.message}`);
      }
    }
    // MAX
    if (user.maxChatId) {
      try {
        await this.maxService.sendBroadcastMessage(user.maxChatId, text);
      } catch (e: any) {
        this.logger.warn(`MAX delivery failed for ${user.id}: ${e?.message}`);
      }
    }
    // Email
    if (user.email) {
      try {
        const html = renderReminderEmail({ title: ev.title, when, offset, studentName: ev.student?.name });
        await this.emailService.sendEmail(user.email, title, html);
      } catch (e: any) {
        this.logger.warn(`Email delivery failed for ${user.id}: ${e?.message}`);
      }
    }
  }
}

function toIcal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    d.getUTCFullYear() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    'Z'
  );
}

function renderReminderEmail(p: { title: string; when: string; offset: string; studentName?: string | null }): string {
  const tail = p.studentName ? ` с <strong>${escape(p.studentName)}</strong>` : '';
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; color: #111827; max-width: 560px;">
      <h2 style="color: #FF7E58; margin-bottom: 12px;">Напоминание о событии</h2>
      <p style="font-size: 15px; line-height: 1.5;">
        «<strong>${escape(p.title)}</strong>»${tail} начнётся <strong>${escape(p.when)}</strong>
        — это ${escape(p.offset)}.
      </p>
      <p style="color: #6b7280; font-size: 13px;">Открыть календарь: <a href="https://prepodavai.ru/dashboard/calendar">prepodavai.ru/dashboard/calendar</a></p>
    </div>
  `;
}

function escape(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
