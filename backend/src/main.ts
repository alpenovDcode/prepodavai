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
      "Generate a secure secret: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
  }

  // Ограничение размера body запросов (защита от DoS)
  app.use(require('express').json({ limit: '50mb' }));
  app.use(require('express').urlencoded({ limit: '50mb', extended: true }));

  // Serve static files from uploads directory (under /api prefix to match Nginx proxying)
  app.use('/api/uploads', require('express').static(require('path').join(process.cwd(), 'uploads')));

  // Helmet для безопасности HTTP заголовков
  // Helmet для безопасности HTTP заголовков
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          // Removed 'unsafe-eval' to improve security. If frontend breaks (e.g. some obscure library), revert this.
          // Added 'unsafe-inline' for styles because many UI libraries need it.
          scriptSrc: ["'self'", "'unsafe-inline'"],
          scriptSrcAttr: ["'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          styleSrcAttr: ["'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'", "https:"],
          frameSrc: ["'self'", "https:"], // For iframes if needed
        },
      },
      crossOriginEmbedderPolicy: false, // Для Telegram WebApp
      crossOriginResourcePolicy: { policy: 'cross-origin' }, // Разрешаем загрузку ресурсов с других доменов
    }),
  );

  // Глобальная обработка ошибок
  app.useGlobalFilters(new HttpExceptionFilter(configService));

  // Глобальная валидация
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false, // Разрешаем дополнительные поля (например, userHash от фронтенда)
      transform: true,
    }),
  );

  // CORS с валидацией
  const corsOrigin = configService.get<string>('CORS_ORIGIN', 'http://localhost:3000');
  const origins = corsOrigin.split(',').map((origin) => origin.trim());

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
