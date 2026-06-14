import { Module } from '@nestjs/common';
import { StudentsService } from './students.service';
import { StudentsController } from './students.controller';
import { StudentInvitesService } from './student-invites.service';
import { StudentInvitesController } from './student-invites.controller';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { ClassesModule } from '../classes/classes.module';
import { ReferralsModule } from '../referrals/referrals.module';
import { GamificationModule } from '../gamification/gamification.module';

@Module({
  imports: [PrismaModule, ClassesModule, ReferralsModule, GamificationModule],
  controllers: [StudentsController, StudentInvitesController],
  providers: [StudentsService, StudentInvitesService],
  exports: [StudentsService, StudentInvitesService],
})
export class StudentsModule {}
