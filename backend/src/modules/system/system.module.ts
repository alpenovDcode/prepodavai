import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SystemService } from './system.service';
import { SystemController, AdminSystemController } from './system.controller';
import { MaintenanceMiddleware } from './maintenance.middleware';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AdminModule } from '../admin/admin.module';

@Module({
  imports: [ConfigModule, PrismaModule, AdminModule],
  controllers: [SystemController, AdminSystemController],
  providers: [SystemService],
  exports: [SystemService],
})
export class SystemModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Применяем ко ВСЕМ routes; whitelist'ы и admin-проверка — внутри middleware.
    consumer.apply(MaintenanceMiddleware).forRoutes('*');
  }
}
