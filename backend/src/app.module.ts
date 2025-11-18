import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bullmq';

import { AppController } from './app.controller';
import { AppService } from './app.service';

// Database
import { PrismaModule } from './common/prisma/prisma.module';

// Modules
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { GenerationsModule } from './modules/generations/generations.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { TelegramModule } from './modules/telegram/telegram.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { LogsModule } from './modules/logs/logs.module';
import { FilesModule } from './modules/files/files.module';
import { AdminModule } from './modules/admin/admin.module';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),

    // Rate Limiting
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 1 minute
        limit: 100, // 100 requests per minute
      },
    ]),

    // BullMQ для очередей
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
      },
    }),

    // Database
    PrismaModule,

    // Feature Modules
    AuthModule,
    UsersModule,
    GenerationsModule,
    SubscriptionsModule,
    TelegramModule,
    WebhooksModule,
    LogsModule,
    FilesModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
