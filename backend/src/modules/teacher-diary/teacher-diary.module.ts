import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { GenerationsModule } from '../generations/generations.module';
import { TeacherDiaryService } from './teacher-diary.service';
import { TeacherDiaryController } from './teacher-diary.controller';

@Module({
  imports: [PrismaModule, GenerationsModule],
  controllers: [TeacherDiaryController],
  providers: [TeacherDiaryService],
})
export class TeacherDiaryModule {}
