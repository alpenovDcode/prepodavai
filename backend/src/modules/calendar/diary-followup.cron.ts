import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { RRule } from 'rrule';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TelegramService } from '../telegram/telegram.service';
import { MaxService } from '../max/max.service';

/**
 * Cron-сервис «заполни дневник после урока».
 *
 * Тикает каждый час. Ищет occurrences событий типа `lesson` (с
 * привязанным студентом), которые закончились между 2ч и 26ч назад,
 * И для которых нет TeacherDiaryEntry в этот день по тому же ученику.
 * Шлёт ровно одно напоминание (in-app + Telegram + MAX), помечая
 * маркер `diary@<occISO>` в `remindersSent` чтобы не дублировать.
 *
 * Используются те же маркеры, что и для напоминаний — таблица одна.
 */
const TICK_INTERVAL_MS = 60 * 60 * 1000;   // 1 час
const STARTUP_DELAY_MS = 90 * 1000;        // 1.5 минуты после старта
const LOOK_BACK_MS = 26 * 60 * 60 * 1000;  // 26 часов назад
const LOOK_FRESH_MS = 2 * 60 * 60 * 1000;  // не раньше чем 2 часа назад

@Injectable()
export class DiaryFollowupCronService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DiaryFollowupCronService.name);
  private intervalRef: NodeJS.Timeout | null = null;
  private startupTimeoutRef: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
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
      const from = new Date(now.getTime() - LOOK_BACK_MS);
      const to = new Date(now.getTime() - LOOK_FRESH_MS);

      // Кандидаты — события-уроки с привязкой к ученику.
      // Берём всё, что могло закончиться в [from, to].
      const candidates = await this.prisma.calendarEvent.findMany({
        where: {
          eventType: 'lesson',
          studentId: { not: null },
          status: { not: 'cancelled' },
          OR: [
            { startAt: { gte: from, lte: to } },
            { recurrenceRuleId: { not: null } },
          ],
        },
        include: {
          user: { select: { id: true, telegramChatId: true, maxChatId: true } },
          student: { select: { id: true, name: true } },
          recurrenceRule: { select: { rrule: true } },
        },
      });

      let sent = 0;
      for (const ev of candidates) {
        const occurrences = this.computeOccurrences(ev, from, to);
        for (const occStart of occurrences) {
          const marker = `diary@${occStart.toISOString()}`;
          if ((ev.remindersSent || []).includes(marker)) continue;

          // Проверка: уже есть запись в дневнике за этот день?
          const dayStart = startOfDay(occStart);
          const dayEnd = endOfDay(occStart);
          const existingEntry = await this.prisma.teacherDiaryEntry.findFirst({
            where: {
              teacherId: ev.userId,
              studentId: ev.studentId!,
              date: { gte: dayStart, lte: dayEnd },
            },
            select: { id: true },
          });
          if (existingEntry) {
            // Дневник заполнен — помечаем маркер, чтобы больше не проверять.
            await this.prisma.calendarEvent.update({
              where: { id: ev.id },
              data: { remindersSent: { push: marker } },
            });
            continue;
          }

          try {
            await this.deliver(ev, occStart);
            await this.prisma.calendarEvent.update({
              where: { id: ev.id },
              data: { remindersSent: { push: marker } },
            });
            sent++;
          } catch (err: any) {
            this.logger.warn(`Diary follow-up for ${ev.id}@${occStart.toISOString()} failed: ${err?.message}`);
          }
        }
      }

      if (sent > 0) this.logger.log(`Diary follow-ups sent: ${sent}`);
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

  private async deliver(ev: any, occStart: Date) {
    const user = ev.user;
    if (!user) return;
    const studentName = ev.student?.name || 'учеником';
    const dayLabel = occStart.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });

    const title = 'Заполни дневник урока';
    const text = `Урок «${ev.title}» с ${studentName} от ${dayLabel} прошёл — добавь запись в дневник.`;

    await this.notificationsService.createNotification({
      userId: user.id,
      userType: 'teacher',
      type: 'deadline_reminder',
      title,
      message: text,
      metadata: {
        eventId: ev.id,
        occurrenceStart: occStart.toISOString(),
        kind: 'diary_followup',
        studentId: ev.studentId,
      },
    });

    if (user.telegramChatId) {
      try { await this.telegramService.sendBroadcastMessage(user.telegramChatId, text); }
      catch (e: any) { this.logger.warn(`TG diary follow-up failed: ${e?.message}`); }
    }
    if (user.maxChatId) {
      try { await this.maxService.sendBroadcastMessage(user.maxChatId, text); }
      catch (e: any) { this.logger.warn(`MAX diary follow-up failed: ${e?.message}`); }
    }
  }
}

function toIcal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) +
    'T' + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + 'Z'
  );
}

function startOfDay(d: Date): Date {
  const x = new Date(d); x.setHours(0, 0, 0, 0); return x;
}
function endOfDay(d: Date): Date {
  const x = new Date(d); x.setHours(23, 59, 59, 999); return x;
}
