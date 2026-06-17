import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Сервис календаря репетитора.
 *
 * Phase 1: CRUD над одиночными событиями + чтение существующих
 * Lesson.scheduledAt как readonly-источника событий (legacy-уроки в
 * списке материалов имеют поля расписания, отображаем их в календаре,
 * но редактирование идёт только через CalendarEvent).
 *
 * Phase 2 добавит раскрытие повторений (RRULE → массив occurrences)
 * и перенос отдельной копии (event split via parentEventId + exdate).
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

    // События календаря, попавшие в окно [from, to). Берём всё, что
    // ХОТЯ БЫ КАСАЕТСЯ окна: startAt < to AND endAt >= from.
    const events = await this.prisma.calendarEvent.findMany({
      where: {
        userId,
        startAt: { lt: to },
        endAt: { gte: from },
      },
      include: {
        student: { select: { id: true, name: true, avatar: true } },
        class: { select: { id: true, name: true } },
        lesson: { select: { id: true, title: true, topic: true } },
      },
      orderBy: { startAt: 'asc' },
    });

    // Legacy: уроки с проставленным scheduledAt, у которых ЕЩЁ НЕТ
    // связанного CalendarEvent — показываем их как read-only события.
    // Это даёт постепенную миграцию без потери данных у тех, кто уже
    // ставил даты в /lessons.
    const usedLessonIds = events.map((e) => e.lessonId).filter(Boolean) as string[];
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

    const legacyAsEvents = legacyLessons
      .filter((l) => l.scheduledAt)
      .map((l) => {
        const dur = l.durationMinutes ?? 45;
        const start = l.scheduledAt as Date;
        const end = new Date(start.getTime() + dur * 60 * 1000);
        return {
          id: `lesson:${l.id}`,
          legacy: true as const,
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
          googleEventId: null,
          googleCalendarId: null,
          lastSyncAt: null,
          remindersSent: [] as string[],
          createdAt: start,
          updatedAt: start,
        };
      });

    return [...events, ...legacyAsEvents];
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
      },
      include: {
        student: { select: { id: true, name: true, avatar: true } },
        class: { select: { id: true, name: true } },
        lesson: { select: { id: true, title: true, topic: true } },
      },
    });
  }

  async updateEvent(userId: string, id: string, body: UpdateEventDto) {
    const existing = await this.prisma.calendarEvent.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) {
      throw new NotFoundException('Событие не найдено');
    }

    const data: any = {};
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

    if (data.startAt && data.endAt && data.endAt <= data.startAt) {
      throw new BadRequestException('endAt должен быть позже startAt');
    }

    return this.prisma.calendarEvent.update({
      where: { id },
      data,
      include: {
        student: { select: { id: true, name: true, avatar: true } },
        class: { select: { id: true, name: true } },
        lesson: { select: { id: true, title: true, topic: true } },
      },
    });
  }

  async deleteEvent(userId: string, id: string) {
    const existing = await this.prisma.calendarEvent.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) {
      throw new NotFoundException('Событие не найдено');
    }
    await this.prisma.calendarEvent.delete({ where: { id } });
    return { success: true };
  }
}

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
}

export type UpdateEventDto = Partial<CreateEventDto>;
