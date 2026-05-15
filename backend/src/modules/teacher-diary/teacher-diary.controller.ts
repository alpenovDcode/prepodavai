import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TeacherDiaryService, DiaryEntryInput } from './teacher-diary.service';

@Controller('teacher-diary')
@UseGuards(JwtAuthGuard)
export class TeacherDiaryController {
  constructor(private readonly diary: TeacherDiaryService) {}

  @Get()
  list(@Request() req: any) {
    return this.diary.listEntries(req.user.id);
  }

  @Post()
  create(@Request() req: any, @Body() body: DiaryEntryInput) {
    return this.diary.createEntry(req.user.id, body);
  }

  @Patch(':id')
  update(@Request() req: any, @Param('id') id: string, @Body() body: DiaryEntryInput) {
    return this.diary.updateEntry(req.user.id, id, body);
  }

  @Delete(':id')
  remove(@Request() req: any, @Param('id') id: string) {
    return this.diary.deleteEntry(req.user.id, id);
  }

  @Post(':id/analyze')
  analyze(@Request() req: any, @Param('id') id: string) {
    return this.diary.runAnalysis(req.user.id, id);
  }
}
