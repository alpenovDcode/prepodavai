# Руководство разработчика

## Структура проекта

### Backend (NestJS)

```
backend/
├── src/
│   ├── modules/          # Feature modules
│   │   ├── auth/        # Авторизация
│   │   ├── users/       # Пользователи
│   │   ├── generations/ # Генерации
│   │   ├── subscriptions/ # Подписки и кредиты
│   │   ├── telegram/    # Telegram интеграция
│   │   ├── webhooks/    # Webhook обработка
│   │   └── logs/        # Логирование
│   ├── common/          # Общие модули
│   │   └── prisma/      # Prisma сервис
│   └── config/         # Конфигурация
└── prisma/
    └── schema.prisma    # Схема БД
```

### Frontend (Next.js)

```
frontend/
├── src/
│   ├── app/            # App Router
│   │   ├── (auth)/     # Авторизация
│   │   ├── (dashboard)/ # Основное приложение
│   │   └── api/        # API Routes
│   ├── components/     # React компоненты
│   ├── lib/            # Утилиты и API клиенты
│   └── hooks/          # React hooks
```

### Worker

```
worker/
└── src/
    └── processors/     # Обработчики очередей
```

## Разработка

### Добавление нового типа генерации

1. Добавить тип в `GenerationType` (shared/types/index.ts)
2. Добавить endpoint в `GenerationsController`
3. Добавить маппинг в `GenerationsService.mapGenerationTypeToOperationType()`
4. Добавить webhook URL в `GenerationsService.getWebhookUrl()`
5. Добавить callback handler в `WebhooksController`

### Добавление нового модуля

1. Создать папку в `backend/src/modules/`
2. Создать `*.module.ts`, `*.service.ts`, `*.controller.ts`
3. Импортировать модуль в `AppModule`

### Работа с БД

```bash
# Создать миграцию
cd backend
npm run prisma:migrate dev --name migration_name

# Применить миграции
npm run prisma:migrate deploy

# Открыть Prisma Studio
npm run prisma:studio
```

## Тестирование

```bash
# Backend тесты
cd backend
npm run test

# Frontend тесты
cd frontend
npm run test
```

## Линтинг и форматирование

```bash
# Backend
cd backend
npm run lint
npm run format

# Frontend
cd frontend
npm run lint
```

## Деплой

### Production build

```bash
npm run build
```

### Docker

```bash
docker-compose -f docker-compose.prod.yml build
docker-compose -f docker-compose.prod.yml up -d
```

## Отладка

### Логи

```bash
# Все сервисы
docker-compose logs -f

# Конкретный сервис
docker-compose logs -f backend
```

### База данных

```bash
# Prisma Studio
cd backend
npm run prisma:studio
```

### Redis

```bash
# Подключиться к Redis
docker-compose exec redis redis-cli
```

