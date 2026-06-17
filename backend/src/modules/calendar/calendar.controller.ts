import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CalendarService, CreateEventDto, UpdateEventDto } from './calendar.service';

@Controller('calendar')
@UseGuards(JwtAuthGuard)
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  private userId(req: any): string {
    return req.user?.role === 'student' ? req.user?.teacherId : req.user?.id;
  }

  /**
   * Список событий за период. CalendarEvent (с раскрытыми RRULE-повторениями)
   * + legacy Lesson.scheduledAt без CalendarEvent для плавной миграции.
   */
  @Get('events')
  async listEvents(
    @Request() req: any,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    if (!from || !to) throw new BadRequestException('from и to обязательны');
    return this.calendarService.listEvents(this.userId(req), from, to);
  }

  /**
   * События для студента — его собственные занятия, привязанные через
   * CalendarEvent.studentId. Studend хочет видеть «когда у меня уроки»,
   * без редактирования. Учитель не может дёрнуть этот endpoint (id
   * ученика берётся из JWT, нет произвольного выбора).
   */
  @Get('my-events')
  async myEvents(
    @Request() req: any,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    if (req.user?.role !== 'student') {
      throw new BadRequestException('Только для роли student');
    }
    if (!from || !to) throw new BadRequestException('from и to обязательны');
    return this.calendarService.listStudentEvents(req.user.id, from, to);
  }

  @Post('events')
  async createEvent(@Request() req: any, @Body() body: CreateEventDto) {
    return this.calendarService.createEvent(this.userId(req), body);
  }

  /**
   * Прошедшие уроки за неделю без записи в дневнике. Дашборд показывает
   * баннер «N уроков без записи», модалка события — CTA.
   */
  @Get('diary-pending')
  async diaryPending(@Request() req: any) {
    return this.calendarService.listPendingDiary(this.userId(req));
  }

  /**
   * `scope=single` — отделить ОДНУ копию повтора и редактировать только её.
   * `scope=all` (дефолт) — менять мастер (двигает всю серию).
   */
  @Patch('events/:id')
  async updateEvent(
    @Request() req: any,
    @Param('id') id: string,
    @Query('scope') scope: 'single' | 'all' | undefined,
    @Body() body: UpdateEventDto,
  ) {
    return this.calendarService.updateEvent(this.userId(req), id, body, scope || 'all');
  }

  /** Drag-and-drop хелпер: переносит startAt/endAt с учётом scope. */
  @Patch('events/:id/move')
  async moveEvent(
    @Request() req: any,
    @Param('id') id: string,
    @Query('scope') scope: 'single' | 'all' | undefined,
    @Body() body: { startAt: string; endAt: string },
  ) {
    return this.calendarService.updateEvent(
      this.userId(req),
      id,
      { startAt: body.startAt, endAt: body.endAt },
      scope || 'single',
    );
  }

  @Delete('events/:id')
  async deleteEvent(
    @Request() req: any,
    @Param('id') id: string,
    @Query('scope') scope: 'single' | 'all' | undefined,
  ) {
    return this.calendarService.deleteEvent(this.userId(req), id, scope || 'all');
  }
}
