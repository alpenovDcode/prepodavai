import { Module } from '@nestjs/common';
import { LessonsController } from './lessons.controller';
import { LessonsService } from './lessons.service';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { ReplicateModule } from '../replicate/replicate.module';

@Module({
  imports: [PrismaModule, ReplicateModule],
  controllers: [LessonsController],
  providers: [LessonsService],
  exports: [LessonsService],
})
export class LessonsModule {}
