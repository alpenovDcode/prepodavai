import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminGuard } from './guards/admin.guard';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { FilesModule } from '../files/files.module';
import { LogsModule } from '../logs/logs.module';

@Module({
  imports: [PrismaModule, FilesModule, LogsModule],
  controllers: [AdminController],
  providers: [AdminService, AdminGuard],
  exports: [AdminService],
})
export class AdminModule {}
