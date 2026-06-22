import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import * as compression from 'compression';
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

/**
 * Глобальный axios-интерсептор: автоматически проксирует ВСЕ запросы к Replicate
 * (api.replicate.com, *.replicate.delivery) через HTTPS-прокси, если он задан в env.
 * Причина: РКН блокирует прямой путь к Replicate с РФ-хостинга. На прод-сервере
 * уже поднят tinyproxy для Telegram (TELEGRAM_PROXY) — переиспользуем его.
 *
 * Применяется к любому коду — replicate.service, processors, прямые axios.post —
 * не нужно дёргать каждый вызов вручную. Прокси задаётся одним из env (порядок
 * приоритета): REPLICATE_PROXY, TELEGRAM_PROXY, HTTPS_PROXY, https_proxy, ALL_PROXY.
 */
function setupReplicateProxyInterceptor() {
  const proxyUrl = (
    process.env.REPLICATE_PROXY ||
    process.env.TELEGRAM_PROXY ||
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.ALL_PROXY ||
    ''
  ).trim();
  if (!proxyUrl) return;
  let agent: HttpsProxyAgent<string>;
  try {
    agent = new HttpsProxyAgent(proxyUrl);
  } catch (e) {
    Logger.error(`[bootstrap] Bad proxy URL "${proxyUrl}": ${(e as Error).message}`);
    return;
  }
  const u = new URL(proxyUrl);
  Logger.log(
    `[bootstrap] Routing api.replicate.com/replicate.delivery через прокси ${u.protocol}//${u.host}`,
  );
  axios.interceptors.request.use((config) => {
    const url = (config.baseURL || '') + (config.url || '');
    if (/api\.replicate\.com|replicate\.delivery/i.test(url)) {
      config.httpsAgent = agent;
      config.proxy = false;
    }
    return config;
  });
}

async function bootstrap() {
  setupReplicateProxyInterceptor();
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
    origin: (requestOrigin, callback) => {
      // Запросы без Origin (curl, server-to-server) — разрешаем
      if (!requestOrigin) return callback(null, true);
      if (origins.includes(requestOrigin)) return callback(null, true);
      callback(new Error(`CORS: origin not allowed — ${requestOrigin}`));
    },
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
    optionsSuccessStatus: 204,
  });

  const port = configService.get<number>('PORT', 3001);

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

  // rawBody сохраняется только для webhook-путей CloudPayments (экономия памяти).
  // Для всех остальных запросов buf не удерживается в памяти.
  const captureRawBody = (req: any, _res: any, buf: Buffer) => {
    if (req.url?.includes('/payments/webhook')) {
      req.rawBody = buf;
    }
  };

  app.use(require('express').json({ limit: '10mb', verify: captureRawBody }));
  app.use(require('express').urlencoded({ limit: '10mb', extended: true, verify: captureRawBody }));
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
          scriptSrc: ["'self'"],
          scriptSrcAttr: [],
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
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(port, '0.0.0.0');
  console.log(`🚀 Backend API запущен на порту ${port}`);
}

bootstrap();
