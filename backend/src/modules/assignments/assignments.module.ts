import { Module } from '@nestjs/common';
import { AssignmentsService } from './assignments.service';
import { AssignmentsController } from './assignments.controller';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { ClassesModule } from '../classes/classes.module';
import { StudentsModule } from '../students/students.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, ClassesModule, StudentsModule, NotificationsModule],
  controllers: [AssignmentsController],
  providers: [AssignmentsService],
  exports: [AssignmentsService],
})
export class AssignmentsModule {}
