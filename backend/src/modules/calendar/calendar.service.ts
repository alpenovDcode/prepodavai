import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { RRule } from 'rrule';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../../common/services/email.service';

/**
 * Сервис календаря репетитора.
 *
 * Phase 1 (готово): CRUD одиночных событий + legacy-уроки.
 * Phase 2 (этот файл): RRULE-повторения с раскрытием в occurrences,
 * исключениями (exdate) и scope-aware update/delete:
 *   • scope='single' — отвязать ОДНУ копию (новый CalendarEvent с
 *     parentEventId, родителю добавляется exdate). Перетянул один
 *     вторник на среду — остальные вторники не двигаются.
 *   • scope='all' — поменять мастер-событие (двигает всю серию).
 *
 * Occurrences НЕ хранятся в БД — раскрываются на лету по window'у
 * запроса. Это даёт неограниченную бесконечность повторений без
 * раздувания таблиц.
 */
@Injectable()
export class CalendarService {
  private readonly logger = new Logger(CalendarService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly email: EmailService,
  ) {}

  async listEvents(userId: string, fromIso: string, toIso: string) {
    const from = new Date(fromIso);
    const to = new Date(toIso);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException('Некорректный диапазон from/to');
    }
    if (to.getTime() - from.getTime() > 1000 * 60 * 60 * 24 * 366) {
      throw new BadRequestException('Диапазон не должен превышать 366 дней');
    }

    // 1) Все мастер-события пользователя, которые могут давать
    // occurrences в окне. Берём широко: либо одиночное событие в окне,
    // либо событие с RRULE (тогда фильтрация по startAt бессмысленна,
    // тянем все). Дочерние «оторванные» события (parentEventId) тоже
    // включаем — у них своё startAt в окне.
    const candidates = await this.prisma.calendarEvent.findMany({
      where: {
        userId,
        OR: [
          { startAt: { lt: to }, endAt: { gte: from } },     // одиночное в окне
          { recurrenceRuleId: { not: null } },                // любая серия
          { parentEventId: { not: null }, startAt: { lt: to }, endAt: { gte: from } },
        ],
      },
      include: {
        student: { select: { id: true, name: true, avatar: true } },
        class: { select: { id: true, name: true } },
        lesson: { select: { id: true, title: true, topic: true } },
        recurrenceRule: { select: { id: true, rrule: true } },
      },
      orderBy: { startAt: 'asc' },
    });

    // 2) Раскрываем occurrences. Одиночные события — отдают сами себя.
    // События с RRULE — генерим occurrences через rrule.between().
    const expanded: any[] = [];
    for (const ev of candidates) {
      if (!ev.recurrenceRule) {
        // Одиночное событие — добавляем как есть, но только если оно
        // действительно попало в окно (для parentless without rule
        // фильтр в SQL уже сработал).
        if (ev.startAt < to && ev.endAt >= from) {
          expanded.push({ ...ev, occurrenceStart: ev.startAt });
        }
        continue;
      }

      // Серия: parse RRULE с DTSTART = мастер.startAt
      const occurrences = expandOccurrences(
        ev.recurrenceRule.rrule,
        ev.startAt,
        from,
        to,
        ev.recurrenceExdate || [],
      );
      const durationMs = ev.endAt.getTime() - ev.startAt.getTime();
      for (const occStart of occurrences) {
        const occEnd = new Date(occStart.getTime() + durationMs);
        expanded.push({
          ...ev,
          // Уникальный id для каждой копии — нужен фронту в качестве key.
          // Реальный id мастера остаётся в ev.id для PATCH/DELETE.
          id: `${ev.id}__${occStart.toISOString()}`,
          masterId: ev.id,
          isRecurringInstance: true,
          occurrenceStart: occStart,
          startAt: occStart,
          endAt: occEnd,
        });
      }
    }

    // 3) Legacy Lesson.scheduledAt — для постепенной миграции.
    const usedLessonIds = candidates.map((e) => e.lessonId).filter(Boolean) as string[];
    const legacyLessons = await this.prisma.lesson.findMany({
      where: {
        userId,
        scheduledAt: { gte: from, lt: to },
        NOT: usedLessonIds.length > 0 ? { id: { in: usedLessonIds } } : undefined,
      },
      select: {
        id: true,
        title: true,
        topic: true,
        scheduledAt: true,
        durationMinutes: true,
        classId: true,
        class: { select: { id: true, name: true } },
      },
    });

    for (const l of legacyLessons) {
      if (!l.scheduledAt) continue;
      const dur = l.durationMinutes ?? 45;
      const start = l.scheduledAt as Date;
      const end = new Date(start.getTime() + dur * 60 * 1000);
      expanded.push({
        id: `lesson:${l.id}`,
        legacy: true,
        userId,
        title: l.title || l.topic,
        startAt: start,
        endAt: end,
        allDay: false,
        notes: null,
        location: null,
        meetingUrl: null,
        studentId: null,
        student: null,
        classId: l.classId,
        class: l.class,
        lessonId: l.id,
        lesson: { id: l.id, title: l.title, topic: l.topic },
        subject: null,
        eventType: 'lesson',
        format: 'online',
        status: 'planned',
        color: null,
        recurrenceRuleId: null,
        recurrenceExdate: [],
        parentEventId: null,
        remindersSent: [] as string[],
      });
    }

    expanded.sort(
      (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
    );
    return expanded;
  }

  /**
   * События для конкретного студента (его кабинет).
   * Не использует teacherId — ищет события по studentId независимо от
   * того, кто их создал. Возвращает с раскрытыми RRULE-occurrences.
   */
  async listStudentEvents(studentId: string, fromIso: string, toIso: string) {
    const from = new Date(fromIso);
    const to = new Date(toIso);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException('Некорректный диапазон from/to');
    }
    if (to.getTime() - from.getTime() > 1000 * 60 * 60 * 24 * 366) {
      throw new BadRequestException('Диапазон не должен превышать 366 дней');
    }

    const candidates = await this.prisma.calendarEvent.findMany({
      where: {
        studentId,
        status: { not: 'cancelled' },
        OR: [
          { startAt: { lt: to }, endAt: { gte: from } },
          { recurrenceRuleId: { not: null } },
        ],
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, avatar: true } },
        recurrenceRule: { select: { id: true, rrule: true } },
      },
      orderBy: { startAt: 'asc' },
    });

    const expanded: any[] = [];
    for (const ev of candidates) {
      if (!ev.recurrenceRule) {
        if (ev.startAt < to && ev.endAt >= from) {
          expanded.push({ ...ev, occurrenceStart: ev.startAt });
        }
        continue;
      }
      const occurrences = expandOccurrences(
        ev.recurrenceRule.rrule,
        ev.startAt,
        from,
        to,
        ev.recurrenceExdate || [],
      );
      const durationMs = ev.endAt.getTime() - ev.startAt.getTime();
      for (const occStart of occurrences) {
        const occEnd = new Date(occStart.getTime() + durationMs);
        expanded.push({
          ...ev,
          id: `${ev.id}__${occStart.toISOString()}`,
          masterId: ev.id,
          isRecurringInstance: true,
          occurrenceStart: occStart,
          startAt: occStart,
          endAt: occEnd,
        });
      }
    }
    expanded.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
    return expanded;
  }

  async createEvent(userId: string, body: CreateEventDto) {
    const start = new Date(body.startAt);
    const end = new Date(body.endAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('Некорректные даты startAt/endAt');
    }
    if (end <= start) {
      throw new BadRequestException('endAt должен быть позже startAt');
    }
    if (!body.title?.trim()) {
      throw new BadRequestException('title обязателен');
    }

    // Если передано правило повторения — создаём RecurrenceRule и линкуем.
    let recurrenceRuleId: string | undefined;
    if (body.rrule && body.rrule.trim()) {
      assertValidRRule(body.rrule, start);
      const rule = await this.prisma.recurrenceRule.create({
        data: { rrule: body.rrule.trim() },
      });
      recurrenceRuleId = rule.id;
    }

    const created = await this.prisma.calendarEvent.create({
      data: {
        userId,
        title: body.title.trim(),
        startAt: start,
        endAt: end,
        allDay: !!body.allDay,
        notes: body.notes || null,
        location: body.location || null,
        meetingUrl: body.meetingUrl || null,
        studentId: body.studentId || null,
        classId: body.classId || null,
        lessonId: body.lessonId || null,
        subject: body.subject || null,
        eventType: body.eventType || 'lesson',
        format: body.format || 'online',
        status: body.status || 'planned',
        color: body.color || null,
        recurrenceRuleId,
      },
      include: this.relInclude(),
    });

    // Если событие привязано к ученику — шлём ему уведомление сразу.
    // Это in-app (в колокольчике у студента) + email если есть.
    if (created.studentId) {
      this.notifyStudent(created, 'lesson_scheduled').catch((e) =>
        this.logger.warn(`notifyStudent (create) failed: ${e?.message}`),
      );
    }

    return created;
  }

  /**
   * scope:
   *  'single' — отделить ОДНУ копию повтора и редактировать её.
   *             id = "master__<iso>" → создаётся новый CalendarEvent
   *             с parentEventId=master, master.recurrenceExdate += <iso>.
   *  'all'    — поменять мастер-событие (двигает всю серию).
   */
  async updateEvent(
    userId: string,
    id: string,
    body: UpdateEventDto,
    scope: 'single' | 'all' = 'all',
  ) {
    const { masterId, occurrenceIso } = parseInstanceId(id);

    if (occurrenceIso && scope === 'single') {
      return this.detachOccurrenceAndUpdate(userId, masterId, occurrenceIso, body);
    }

    // PATCH мастера (или одиночного события).
    const existing = await this.prisma.calendarEvent.findUnique({ where: { id: masterId } });
    if (!existing || existing.userId !== userId) {
      throw new NotFoundException('Событие не найдено');
    }

    const data: any = {};
    this.applyFields(data, body);

    if (data.startAt && data.endAt && data.endAt <= data.startAt) {
      throw new BadRequestException('endAt должен быть позже startAt');
    }

    // Обновление rrule: пересоздаём RecurrenceRule (старый удаляем если
    // больше никем не используется).
    if (body.rrule !== undefined) {
      if (body.rrule && body.rrule.trim()) {
        const newStart = data.startAt || existing.startAt;
        assertValidRRule(body.rrule, newStart);
        const rule = await this.prisma.recurrenceRule.create({
          data: { rrule: body.rrule.trim() },
        });
        data.recurrenceRuleId = rule.id;
      } else {
        data.recurrenceRuleId = null;
      }
    }

    const updated = await this.prisma.calendarEvent.update({
      where: { id: masterId },
      data,
      include: this.relInclude(),
    });

    // Уведомляем студента, если изменилось важное:
    // — перенос времени (startAt или endAt)
    // — отмена (status='cancelled')
    // — назначение нового ученика (studentId стал не null)
    if (updated.studentId) {
      const movedTime = data.startAt || data.endAt
      const cancelled = data.status === 'cancelled' && existing.status !== 'cancelled'
      const newlyAssigned = body.studentId && existing.studentId !== body.studentId
      if (cancelled) {
        this.notifyStudent(updated, 'lesson_cancelled').catch((e) =>
          this.logger.warn(`notifyStudent (cancel) failed: ${e?.message}`),
        );
      } else if (movedTime) {
        this.notifyStudent(updated, 'lesson_rescheduled').catch((e) =>
          this.logger.warn(`notifyStudent (reschedule) failed: ${e?.message}`),
        );
      } else if (newlyAssigned) {
        this.notifyStudent(updated, 'lesson_scheduled').catch((e) =>
          this.logger.warn(`notifyStudent (assign) failed: ${e?.message}`),
        );
      }
    }

    return updated;
  }

  async deleteEvent(
    userId: string,
    id: string,
    scope: 'single' | 'all' = 'all',
  ) {
    const { masterId, occurrenceIso } = parseInstanceId(id);

    if (occurrenceIso && scope === 'single') {
      // Удаляем одну копию повтора через exdate.
      const master = await this.prisma.calendarEvent.findUnique({ where: { id: masterId } });
      if (!master || master.userId !== userId) {
        throw new NotFoundException('Событие не найдено');
      }
      const occDate = new Date(occurrenceIso);
      await this.prisma.calendarEvent.update({
        where: { id: masterId },
        data: { recurrenceExdate: { push: occDate } },
      });
      return { success: true };
    }

    const existing = await this.prisma.calendarEvent.findUnique({
      where: { id: masterId },
      include: this.relInclude(),
    });
    if (!existing || existing.userId !== userId) {
      throw new NotFoundException('Событие не найдено');
    }
    if (existing.studentId) {
      this.notifyStudent(existing as any, 'lesson_cancelled').catch((e) =>
        this.logger.warn(`notifyStudent (delete) failed: ${e?.message}`),
      );
    }
    await this.prisma.calendarEvent.delete({ where: { id: masterId } });
    return { success: true };
  }

  // ─── notifyStudent ────────────────────────────────────────────────────
  //
  // In-app уведомление (студент видит в /student/notifications) + email
  // если у студента указан. У студента нет своего TG/MAX, у него только
  // веб-уведомления и email — так устроена модель Student в проде.
  private async notifyStudent(
    event: any,
    kind: 'lesson_scheduled' | 'lesson_rescheduled' | 'lesson_cancelled',
  ) {
    const student = await this.prisma.student.findUnique({
      where: { id: event.studentId },
      select: { id: true, name: true, email: true },
    });
    if (!student) return;

    const when = new Date(event.startAt).toLocaleString('ru-RU', {
      day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
    });
    const titleMap = {
      lesson_scheduled: 'Назначен урок',
      lesson_rescheduled: 'Урок перенесён',
      lesson_cancelled: 'Урок отменён',
    } as const;
    const messageMap = {
      lesson_scheduled: `Назначен урок «${event.title}» на ${when}.`,
      lesson_rescheduled: `Урок «${event.title}» перенесён на ${when}.`,
      lesson_cancelled: `Урок «${event.title}» отменён.`,
    } as const;

    await this.notifications.createNotification({
      userId: student.id,
      userType: 'student',
      type: kind,
      title: titleMap[kind],
      message: messageMap[kind],
      metadata: {
        eventId: event.id,
        startAt: new Date(event.startAt).toISOString(),
        meetingUrl: event.meetingUrl || null,
        location: event.location || null,
      },
    });

    if (student.email) {
      const html = renderStudentEmail(kind, {
        studentName: student.name,
        title: event.title,
        when,
        meetingUrl: event.meetingUrl,
        location: event.location,
      });
      try {
        await this.email.sendEmail(student.email, titleMap[kind], html);
      } catch (e: any) {
        this.logger.warn(`Student email failed: ${e?.message}`);
      }
    }
  }

  // ─── helpers ──────────────────────────────────────────────────────────

  private async detachOccurrenceAndUpdate(
    userId: string,
    masterId: string,
    occurrenceIso: string,
    body: UpdateEventDto,
  ) {
    const master = await this.prisma.calendarEvent.findUnique({ where: { id: masterId } });
    if (!master || master.userId !== userId) {
      throw new NotFoundException('Событие не найдено');
    }

    const occDate = new Date(occurrenceIso);
    const durationMs = master.endAt.getTime() - master.startAt.getTime();

    // Поля новой копии = мастер + патч.
    const newStart = body.startAt ? new Date(body.startAt) : occDate;
    const newEnd = body.endAt
      ? new Date(body.endAt)
      : new Date(newStart.getTime() + durationMs);
    if (newEnd <= newStart) {
      throw new BadRequestException('endAt должен быть позже startAt');
    }

    // Транзакция: создаём новый event + добавляем exdate.
    const [detached] = await this.prisma.$transaction([
      this.prisma.calendarEvent.create({
        data: {
          userId,
          parentEventId: masterId,
          startAt: newStart,
          endAt: newEnd,
          allDay: body.allDay ?? master.allDay,
          title: body.title ?? master.title,
          notes: body.notes ?? master.notes,
          location: body.location ?? master.location,
          meetingUrl: body.meetingUrl ?? master.meetingUrl,
          studentId: body.studentId ?? master.studentId,
          classId: body.classId ?? master.classId,
          lessonId: body.lessonId ?? master.lessonId,
          subject: body.subject ?? master.subject,
          eventType: body.eventType ?? master.eventType,
          format: body.format ?? master.format,
          status: body.status ?? master.status,
          color: body.color ?? master.color,
        },
        include: this.relInclude(),
      }),
      this.prisma.calendarEvent.update({
        where: { id: masterId },
        data: { recurrenceExdate: { push: occDate } },
      }),
    ]);
    return detached;
  }

  private applyFields(data: any, body: UpdateEventDto) {
    if (body.title !== undefined) data.title = body.title;
    if (body.startAt !== undefined) data.startAt = new Date(body.startAt);
    if (body.endAt !== undefined) data.endAt = new Date(body.endAt);
    if (body.allDay !== undefined) data.allDay = body.allDay;
    if (body.notes !== undefined) data.notes = body.notes;
    if (body.location !== undefined) data.location = body.location;
    if (body.meetingUrl !== undefined) data.meetingUrl = body.meetingUrl;
    if (body.studentId !== undefined) data.studentId = body.studentId;
    if (body.classId !== undefined) data.classId = body.classId;
    if (body.lessonId !== undefined) data.lessonId = body.lessonId;
    if (body.subject !== undefined) data.subject = body.subject;
    if (body.eventType !== undefined) data.eventType = body.eventType;
    if (body.format !== undefined) data.format = body.format;
    if (body.status !== undefined) data.status = body.status;
    if (body.color !== undefined) data.color = body.color;
  }

  private relInclude() {
    return {
      student: { select: { id: true, name: true, avatar: true } },
      class: { select: { id: true, name: true } },
      lesson: { select: { id: true, title: true, topic: true } },
      recurrenceRule: { select: { id: true, rrule: true } },
    };
  }
}

// ─── RRULE helpers (модульный уровень) ──────────────────────────────────

/**
 * Принимает RRULE-строку («FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=…»),
 * DTSTART (startAt мастера), окно [from, to) и массив exceptions —
 * возвращает массив дат начала occurrences в окне.
 */
function expandOccurrences(
  rruleStr: string,
  dtStart: Date,
  from: Date,
  to: Date,
  exdates: Date[],
): Date[] {
  try {
    const rule = RRule.fromString(`DTSTART:${rruleToIcal(dtStart)}\nRRULE:${rruleStr}`);
    const occs = rule.between(from, to, true);
    if (exdates.length === 0) return occs;
    const excluded = new Set(exdates.map((d) => d.getTime()));
    return occs.filter((d) => !excluded.has(d.getTime()));
  } catch (e) {
    // Битое правило — не падаем, просто возвращаем мастер если в окне.
    if (dtStart >= from && dtStart < to) return [dtStart];
    return [];
  }
}

function rruleToIcal(d: Date): string {
  // RRULE требует DTSTART в формате 20260617T120000Z.
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

function assertValidRRule(rruleStr: string, dtStart: Date) {
  try {
    RRule.fromString(`DTSTART:${rruleToIcal(dtStart)}\nRRULE:${rruleStr}`);
  } catch (e: any) {
    throw new BadRequestException(`Невалидное правило повторения: ${e?.message}`);
  }
}

/**
 * id из листинга может быть «master__<isoStartAt>» (одна копия серии)
 * или просто «uuid» (мастер/одиночное). Возвращаем оба компонента.
 */
function parseInstanceId(id: string): { masterId: string; occurrenceIso: string | null } {
  const sep = id.indexOf('__');
  if (sep === -1) return { masterId: id, occurrenceIso: null };
  return { masterId: id.slice(0, sep), occurrenceIso: id.slice(sep + 2) };
}

// ─── DTO ──────────────────────────────────────────────────────────────

export interface CreateEventDto {
  title: string;
  startAt: string;
  endAt: string;
  allDay?: boolean;
  notes?: string;
  location?: string;
  meetingUrl?: string;
  studentId?: string;
  classId?: string;
  lessonId?: string;
  subject?: string;
  eventType?: 'lesson' | 'meeting' | 'break' | 'personal';
  format?: 'online' | 'offline' | 'hybrid';
  status?: 'planned' | 'completed' | 'cancelled';
  color?: string;
  rrule?: string; // RRULE без DTSTART (DTSTART берём из startAt)
}

export type UpdateEventDto = Partial<CreateEventDto>;

function renderStudentEmail(
  kind: 'lesson_scheduled' | 'lesson_rescheduled' | 'lesson_cancelled',
  p: { studentName: string; title: string; when: string; meetingUrl?: string | null; location?: string | null },
): string {
  const heading = kind === 'lesson_scheduled' ? 'Назначен новый урок'
    : kind === 'lesson_rescheduled' ? 'Урок перенесён'
    : 'Урок отменён';
  const accent = kind === 'lesson_cancelled' ? '#EF4444' : '#FF7E58';
  const meetingBlock = p.meetingUrl
    ? `<p style="font-size:14px;">🔗 <a href="${escape(p.meetingUrl)}" style="color:${accent};">Войти в видеовстречу</a></p>`
    : '';
  const locationBlock = p.location
    ? `<p style="font-size:14px;">📍 ${escape(p.location)}</p>`
    : '';
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#111827;max-width:560px;">
      <h2 style="color:${accent};margin-bottom:12px;">${heading}</h2>
      <p style="font-size:15px;">Здравствуй, <strong>${escape(p.studentName)}</strong>!</p>
      <p style="font-size:15px;line-height:1.5;">
        Урок «<strong>${escape(p.title)}</strong>» —
        ${kind === 'lesson_cancelled' ? '<em>отменён</em>.' : `<strong>${escape(p.when)}</strong>.`}
      </p>
      ${kind !== 'lesson_cancelled' ? meetingBlock + locationBlock : ''}
      <p style="color:#6b7280;font-size:13px;margin-top:20px;">
        Открыть кабинет: <a href="https://prepodavai.ru/student/dashboard" style="color:${accent};">prepodavai.ru</a>
      </p>
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
