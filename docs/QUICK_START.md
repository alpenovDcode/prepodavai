# Быстрый старт PrepodavAI

## Предварительные требования

- Node.js 20+ (LTS)
- Docker & Docker Compose
- PostgreSQL 15+ (или через Docker)
- Redis 7+ (или через Docker)

## Установка

### 1. Клонирование и установка зависимостей

```bash
cd PREPODAVAI
npm run install:all
```

### 2. Настройка переменных окружения

Создайте файлы `.env` в корне проекта и в папках `backend/`, `frontend/`, `worker/`:

```bash
# В корне проекта
cp .env.example .env

# Заполните необходимые переменные:
# - DATABASE_URL
# - REDIS_URL
# - JWT_SECRET
# - TELEGRAM_BOT_TOKEN
# - OPENAI_API_KEY
# - N8N_WEBHOOK_URL
```

### 3. Запуск через Docker Compose

```bash
# Запустить все сервисы
docker-compose up -d

# Проверить статус
docker-compose ps

# Просмотр логов
docker-compose logs -f
```

### 4. Инициализация базы данных

```bash
# Применить миграции Prisma
cd backend
npm run prisma:migrate

# Заполнить начальными данными
npm run prisma:seed
```

### 5. Запуск локально (без Docker)

```bash
# Terminal 1: Backend
cd backend
npm run start:dev

# Terminal 2: Frontend
cd frontend
npm run dev

# Terminal 3: Worker
cd worker
npm run start:dev
```

## Проверка работы

1. **Backend API**: http://localhost:3001/api/health
2. **Frontend**: http://localhost:3000
3. **Prisma Studio**: `cd backend && npm run prisma:studio`

## Структура API

- `POST /api/auth/validate-init-data` - Валидация Telegram initData
- `POST /api/auth/login-with-api-key` - Авторизация через API key
- `POST /api/generate/:type` - Создание генерации
- `GET /api/generate/:requestId` - Статус генерации
- `GET /api/generate/history/list` - История генераций
- `POST /api/webhooks/:type-callback` - Callback от n8n
- `GET /api/subscription/info` - Информация о подписке

## Следующие шаги

1. Настроить Telegram бота
2. Настроить n8n webhooks
3. Мигрировать данные из Chatium (если есть)
4. Настроить production окружение

## Проблемы?

- Проверьте логи: `docker-compose logs`
- Проверьте подключение к БД: `npm run db:studio`
- Проверьте переменные окружения

