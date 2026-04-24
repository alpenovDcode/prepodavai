import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Delete,
  UseGuards,
  Request,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { LessonsService } from './lessons.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('lessons')
@UseGuards(JwtAuthGuard)
export class LessonsController {
  constructor(private readonly lessonsService: LessonsService) {}

  @Post()
  async createLesson(
    @Request() req,
    @Body() body: { topic: string; grade?: string; duration?: number },
  ) {
    return this.lessonsService.createLesson(req.user.id, body);
  }

  @Get()
  async getUserLessons(
    @Request() req,
    @Query('search') search?: string,
    @Query('tag') tag?: string,
  ) {
    return this.lessonsService.getUserLessons(req.user.id, { search, tag });
  }

  // ВАЖНО: специализированные маршруты ДО @Get(':id'), иначе Nest посчитает
  // 'calendar' / 'tags' за параметр id.
  @Get('calendar/events')
  async getCalendarEvents(
    @Request() req,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.lessonsService.getCalendarEvents(req.user.id, from, to);
  }

  @Get('tags/all')
  async getAllTags(@Request() req) {
    return this.lessonsService.getAllUserTags(req.user.id);
  }

  @Get(':id')
  async getLessonById(@Request() req, @Param('id') id: string) {
    return this.lessonsService.getLessonById(req.user.id, id);
  }

  @Patch(':id/schedule')
  async updateSchedule(
    @Request() req,
    @Param('id') id: string,
    @Body()
    body: {
      scheduledAt?: string | null;
      durationMinutes?: number | null;
      classId?: string | null;
      notes?: string | null;
    },
  ) {
    return this.lessonsService.updateSchedule(req.user.id, id, body);
  }

  @Patch(':id/tags')
  async updateTags(
    @Request() req,
    @Param('id') id: string,
    @Body() body: { tags: string[] },
  ) {
    return this.lessonsService.updateTags(req.user.id, id, body.tags);
  }

  @Post(':id/auto-tags')
  @Throttle({ default: { limit: 15, ttl: 60000 } })
  async generateAutoTags(@Request() req, @Param('id') id: string) {
    return this.lessonsService.generateAutoTags(req.user.id, id);
  }

  @Delete(':id')
  async deleteLesson(@Request() req, @Param('id') id: string) {
    return this.lessonsService.deleteLesson(req.user.id, id);
  }
}
