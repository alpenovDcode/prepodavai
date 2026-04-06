import { Module } from '@nestjs/common';
import { StudentsService } from './students.service';
import { StudentsController } from './students.controller';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { ClassesModule } from '../classes/classes.module';
import { ReferralsModule } from '../referrals/referrals.module';

@Module({
  imports: [PrismaModule, ClassesModule, ReferralsModule],
  controllers: [StudentsController],
  providers: [StudentsService],
  exports: [StudentsService],
})
export class StudentsModule {}
