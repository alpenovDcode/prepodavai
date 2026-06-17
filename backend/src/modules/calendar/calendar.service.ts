import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { RRule } from 'rrule';
import { PrismaService } from '../../common/prisma/prisma.service';

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
  constructor(private readonly prisma: PrismaService) {}

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

    return this.prisma.calendarEvent.create({
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

    return this.prisma.calendarEvent.update({
      where: { id: masterId },
      data,
      include: this.relInclude(),
    });
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

    const existing = await this.prisma.calendarEvent.findUnique({ where: { id: masterId } });
    if (!existing || existing.userId !== userId) {
      throw new NotFoundException('Событие не найдено');
    }
    await this.prisma.calendarEvent.delete({ where: { id: masterId } });
    return { success: true };
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
