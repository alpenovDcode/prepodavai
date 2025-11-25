import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
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
import { GigachatModule } from './modules/gigachat/gigachat.module';
import { HtmlExportService } from './common/services/html-export.service';

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
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const redisUrl = configService.get<string>('REDIS_URL', 'redis://localhost:6379');
        // Парсим REDIS_URL для подключения (поддерживает пароль)
        const url = new URL(redisUrl);
        return {
          connection: {
            host: url.hostname,
            port: parseInt(url.port || '6379'),
            password: url.password || undefined,
          },
        };
      },
      inject: [ConfigService],
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
    GigachatModule,
  ],
  controllers: [AppController],
  providers: [AppService, HtmlExportService],
})
export class AppModule {}
