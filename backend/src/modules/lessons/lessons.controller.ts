import { Controller, Get, Post, Body, Param, Delete, UseGuards, Request } from '@nestjs/common';
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
  async getUserLessons(@Request() req) {
    return this.lessonsService.getUserLessons(req.user.id);
  }

  @Get(':id')
  async getLessonById(@Request() req, @Param('id') id: string) {
    return this.lessonsService.getLessonById(req.user.id, id);
  }

  @Delete(':id')
  async deleteLesson(@Request() req, @Param('id') id: string) {
    return this.lessonsService.deleteLesson(req.user.id, id);
  }
}
