# Архитектура PrepodavAI

## Обзор

PrepodavAI - модульная платформа для автоматизации работы преподавателей с использованием AI. Проект построен на современном стеке с возможностью горизонтального масштабирования.

## Архитектурные принципы

1. **Модульность** - каждый функциональный блок независим
2. **Масштабируемость** - поддержка горизонтального масштабирования
3. **Асинхронность** - все генерации через webhooks и очереди
4. **API-First** - все модули доступны через REST API
5. **Типобезопасность** - TypeScript везде

## Структура проекта

```
PREPODAVAI/
├── frontend/          # Next.js приложение
│   ├── src/
│   │   ├── app/      # App Router
│   │   ├── components/
│   │   ├── lib/      # API клиенты, утилиты
│   │   └── hooks/    # React hooks
│   └── public/
│
├── backend/          # NestJS API
│   ├── src/
│   │   ├── modules/  # Feature modules
│   │   │   ├── auth/
│   │   │   ├── users/
│   │   │   ├── generations/
│   │   │   ├── subscriptions/
│   │   │   ├── telegram/
│   │   │   ├── webhooks/
│   │   │   └── logs/
│   │   ├── common/   # Общие модули
│   │   └── config/   # Конфигурация
│   └── prisma/       # Prisma схемы
│
├── worker/           # Worker для фоновых задач
│   └── src/
│       └── processors/
│
├── telegram-bot/     # Telegram бот сервис
│   └── src/
│       └── handlers/
│
└── shared/           # Общий код
    └── types/
```

## Потоки данных

### Генерация контента

```
1. Frontend → POST /api/generate/:type
2. Backend → Проверка кредитов
3. Backend → Создание записи в БД (status: pending)
4. Backend → Отправка в n8n webhook (async)
5. Backend → Возврат { status: 'pending' }
6. n8n обрабатывает → Callback в Backend
7. Backend → Обновление статуса (status: completed)
8. Backend → Добавление задачи в очередь BullMQ
9. Worker → Отправка результата в Telegram
```

### Авторизация

```
Telegram Mini App:
1. Frontend → window.Telegram.WebApp.initData
2. Frontend → POST /api/auth/validate-init-data
3. Backend → Создание/обновление пользователя
4. Backend → Генерация JWT токена
5. Frontend → Сохранение токена

Web версия:
1. Frontend → POST /api/auth/login-with-api-key
2. Backend → Проверка username + apiKey
3. Backend → Генерация JWT токена
4. Frontend → Сохранение токена
```

## Масштабирование

### Горизонтальное масштабирование

1. **Backend API** - можно запускать несколько инстансов за load balancer
2. **Worker** - можно запускать несколько воркеров для обработки очередей
3. **Database** - PostgreSQL поддерживает репликацию
4. **Redis** - можно использовать Redis Cluster

### Вертикальное масштабирование

- Увеличение ресурсов для каждого сервиса
- Оптимизация запросов к БД
- Кэширование часто используемых данных

## Безопасность

1. **JWT токены** - для авторизации
2. **Валидация данных** - class-validator
3. **Rate Limiting** - @nestjs/throttler
4. **CORS** - настройка для разрешенных доменов
5. **SQL Injection** - защита через Prisma ORM

## Мониторинг

1. **Логи** - централизованное логирование в БД
2. **Метрики** - можно добавить Prometheus
3. **Трейсинг** - можно добавить OpenTelemetry

## Деплой

### Development
```bash
docker-compose up -d
```

### Production
```bash
docker-compose -f docker-compose.prod.yml up -d
```

Или отдельный деплой каждого сервиса:
- Frontend → Vercel/Netlify
- Backend → Railway/Fly.io
- Worker → Railway/Fly.io
- Database → Managed PostgreSQL (AWS RDS, DigitalOcean)
- Redis → Managed Redis (Upstash, Redis Cloud)

