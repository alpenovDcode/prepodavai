import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import * as compression from 'compression';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // ПРЕФИКС ДЛЯ API (устанавливаем сразу)
  app.setGlobalPrefix('api');

  // CORS с валидацией (перемещено в самое начало для надежности)
  const corsOrigin = configService.get<string>('CORS_ORIGIN', '');
  const origins = corsOrigin ? corsOrigin.split(',').map((o) => o.trim()) : [];

  // Всегда добавляем основные домены в разрешенные для продакшена
  const prodOrigins = [
    'https://prepodavai.ru',
    'https://www.prepodavai.ru',
    'https://api.prepodavai.ru',
    'https://max.prepodavai.ru',
  ];

  prodOrigins.forEach((origin) => {
    if (!origins.includes(origin)) origins.push(origin);
  });

  // Локальные окружения
  if (!origins.includes('http://localhost:3000')) origins.push('http://localhost:3000');
  if (!origins.includes('http://localhost:3001')) origins.push('http://localhost:3001');

  app.enableCors({
    origin: origins,
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'X-Requested-With',
      'X-HTTP-Method-Override',
      'Range',
    ],
    exposedHeaders: ['Content-Range', 'X-Content-Range', 'Set-Cookie'],
    optionsSuccessStatus: 204, // Важно для корректной обработки preflight OPTIONS
  });

  const port = configService.get<number>('PORT', 3001);
  const nodeEnv = configService.get<string>('NODE_ENV', 'development');

  // Доверяем прокси (Nginx) для корректного определения протокола (https) и IP
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.set('trust proxy', 1);

  // Валидация JWT_SECRET (критично для безопасности)
  const jwtSecret = configService.get<string>('JWT_SECRET');
  if (!jwtSecret || jwtSecret.length < 32) {
    throw new Error(
      'JWT_SECRET must be set and at least 32 characters long. ' +
        "Generate a secure secret: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
  }

  // Ограничение размера body запросов (защита от DoS) - Глобальный лимит 10MB
  // (2GB для видео загружается через Multer в FilesController)
  app.use(require('express').json({ limit: '10mb' }));
  app.use(require('express').urlencoded({ limit: '10mb', extended: true }));
  app.use(require('cookie-parser')());
  app.use(compression());

  // Serve static files from uploads directory (under /api prefix to match Nginx proxying)
  app.use(
    '/api/uploads',
    require('express').static(require('path').join(process.cwd(), 'uploads')),
  );

  // Helmet для безопасности HTTP заголовков
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          scriptSrcAttr: ["'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          styleSrcAttr: ["'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'", 'https:', 'https://api.prepodavai.ru'],
          frameSrc: ["'self'", 'https:'],
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
      forbidNonWhitelisted: false,
      transform: true,
    }),
  );

  await app.listen(port, '0.0.0.0');
  console.log(`🚀 Backend API запущен на порту ${port}`);
}

bootstrap();
