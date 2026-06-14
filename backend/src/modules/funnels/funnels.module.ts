import { Module } from '@nestjs/common';
import { FunnelsService } from './funnels.service';
import { FunnelsController } from './funnels.controller';
import { FunnelsSeedService } from './funnels-seed.service';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AdminModule } from '../admin/admin.module';

@Module({
  imports: [PrismaModule, AdminModule],
  controllers: [FunnelsController],
  providers: [FunnelsService, FunnelsSeedService],
  exports: [FunnelsService],
})
export class FunnelsModule {}
