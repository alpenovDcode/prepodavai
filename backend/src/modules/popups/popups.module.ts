import { Module } from '@nestjs/common';
import { PopupsService } from './popups.service';
import { PopupsController } from './popups.controller';
import { AdminPopupsController } from './admin-popups.controller';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AdminModule } from '../admin/admin.module';

@Module({
  imports: [PrismaModule, AdminModule],
  controllers: [PopupsController, AdminPopupsController],
  providers: [PopupsService],
})
export class PopupsModule {}
