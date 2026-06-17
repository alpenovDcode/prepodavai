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
   * Список событий за период. Возвращает CalendarEvent + legacy-уроки
   * (Lesson.scheduledAt без CalendarEvent) для плавной миграции.
   * Поля from/to — ISO-строки. Период максимум 366 дней.
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

  @Post('events')
  async createEvent(@Request() req: any, @Body() body: CreateEventDto) {
    return this.calendarService.createEvent(this.userId(req), body);
  }

  @Patch('events/:id')
  async updateEvent(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: UpdateEventDto,
  ) {
    return this.calendarService.updateEvent(this.userId(req), id, body);
  }

  /**
   * Drag-and-drop хелпер: меняет только startAt/endAt одним PATCH.
   * Удобно для UI — не нужно тянуть весь объект.
   */
  @Patch('events/:id/move')
  async moveEvent(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: { startAt: string; endAt: string },
  ) {
    return this.calendarService.updateEvent(this.userId(req), id, {
      startAt: body.startAt,
      endAt: body.endAt,
    });
  }

  @Delete('events/:id')
  async deleteEvent(@Request() req: any, @Param('id') id: string) {
    return this.calendarService.deleteEvent(this.userId(req), id);
  }
}
