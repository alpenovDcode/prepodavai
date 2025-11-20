import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3001);
  const nodeEnv = configService.get<string>('NODE_ENV', 'development');

  // Валидация JWT_SECRET (критично для безопасности)
  const jwtSecret = configService.get<string>('JWT_SECRET');
  if (!jwtSecret || jwtSecret.length < 32) {
    throw new Error(
      'JWT_SECRET must be set and at least 32 characters long. ' +
      'Generate a secure secret: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }

  // Ограничение размера body запросов (защита от DoS)
  app.use(require('express').json({ limit: '10mb' }));
  app.use(require('express').urlencoded({ limit: '10mb', extended: true }));

  // Helmet для безопасности HTTP заголовков
  app.use(
    helmet({
      contentSecurityPolicy: nodeEnv === 'production',
      crossOriginEmbedderPolicy: false, // Для Telegram WebApp
    }),
  );

  // Глобальная обработка ошибок
  app.useGlobalFilters(new HttpExceptionFilter(configService));

  // Глобальная валидация
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // CORS с валидацией
  const corsOrigin = configService.get<string>('CORS_ORIGIN', 'http://localhost:3000');
  const origins = corsOrigin.split(',').map(origin => origin.trim());
  
  // Запрещаем * в production
  if (nodeEnv === 'production' && origins.includes('*')) {
    throw new Error('CORS_ORIGIN cannot be * in production');
  }

  // Валидация формата URL
  for (const origin of origins) {
    try {
      new URL(origin);
    } catch {
      throw new Error(`Invalid CORS origin: ${origin}`);
    }
  }

  app.enableCors({
    origin: origins,
    credentials: true,
  });

  // Префикс для API
  app.setGlobalPrefix('api');

  await app.listen(port, '0.0.0.0');
  console.log(`🚀 Backend API запущен на порту ${port}`);
}

bootstrap();

