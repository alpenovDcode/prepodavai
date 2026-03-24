import { Module } from '@nestjs/common';
import { StudentsService } from './students.service';
import { StudentsController } from './students.controller';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { ClassesModule } from '../classes/classes.module';

@Module({
  imports: [PrismaModule, ClassesModule],
  controllers: [StudentsController],
  providers: [StudentsService],
  exports: [StudentsService],
})
export class StudentsModule {}
