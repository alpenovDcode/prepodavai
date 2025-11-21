# PrepodavAI - AI Tutor Copilot

<div align="center">

**Модульная веб-платформа для автоматизации работы преподавателей с использованием AI**

[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3+-blue.svg)](https://www.typescriptlang.org/)
[![NestJS](https://img.shields.io/badge/NestJS-10+-red.svg)](https://nestjs.com/)
[![Next.js](https://img.shields.io/badge/Next.js-14+-black.svg)](https://nextjs.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

---

## 📖 О проекте

PrepodavAI — это комплексная платформа для преподавателей, которая автоматизирует создание учебных материалов с помощью искусственного интеллекта. Система поддерживает генерацию рабочих листов, тестов, планов уроков, презентаций, изображений и транскрипций видео.

### ✨ Основные возможности

- 🤖 **Генерация учебных материалов** — рабочие листы, тесты, планы уроков, словари
- 🎨 **Создание изображений** — генерация иллюстраций для уроков
- 📊 **Презентации** — автоматическое создание презентаций через Gamma AI
- 🎥 **Транскрипция видео** — преобразование видео в текст
- 📱 **Telegram Bot** — интеграция с Telegram Mini App
- 💳 **Система кредитов** — гибкая система подписок и кредитов
- 🔐 **Безопасность** — JWT аутентификация, защита webhook endpoints, валидация данных

---

## 🚀 Технологический стек

### Frontend
- **Next.js 14+** (App Router) — SSR/SSG, оптимизация производительности
- **React 18+** — современные UI компоненты
- **TypeScript** — строгая типизация
- **Tailwind CSS** — utility-first CSS фреймворк
- **Zustand** — легковесное управление состоянием
- **TanStack Query** — кэширование и синхронизация данных
- **Telegram WebApp SDK** — интеграция с Telegram Mini App

### Backend
- **Node.js 20+** (LTS) — серверная платформа
- **NestJS** — прогрессивный Node.js фреймворк
- **TypeScript** — типизация на всех уровнях
- **PostgreSQL 15+** — реляционная база данных
- **Prisma** — современный ORM
- **Redis 7+** — кэширование и очереди
- **BullMQ** — управление очередями задач
- **Helmet** — защита HTTP заголовков
- **Passport JWT** — аутентификация

### Интеграции
- **OpenAI API** — ChatGPT, DALL-E, Whisper
- **Gamma AI API** — создание презентаций
- **n8n Webhooks** — автоматизация генераций
- **Telegram Bot API** (grammy) — Telegram бот

---

## 📁 Структура проекта

```
PREPODAVAI/
├── frontend/              # Next.js приложение
│   ├── src/
│   │   ├── app/          # App Router страницы
│   │   ├── components/   # React компоненты
│   │   └── lib/          # Утилиты и хуки
│   └── Dockerfile
│
├── backend/              # NestJS API
│   ├── src/
│   │   ├── modules/      # Модули приложения
│   │   │   ├── auth/     # Аутентификация
│   │   │   ├── admin/    # Админ-панель
│   │   │   ├── files/    # Работа с файлами
│   │   │   ├── generations/ # Генерации
│   │   │   ├── webhooks/ # Webhook endpoints
│   │   │   └── ...
│   │   └── common/       # Общие модули
│   ├── prisma/           # Prisma схема и миграции
│   └── Dockerfile
│
├── worker/               # Worker для фоновых задач
├── telegram-bot/         # Telegram бот сервис
├── shared/               # Общий код между сервисами
├── docs/                 # Документация
├── docker-compose.yml     # Docker Compose (development)
└── docker-compose.prod.yml # Docker Compose (production)
```

---

## 🛠️ Требования

- **Node.js** 20+ (LTS)
- **npm** 10+
- **Docker** 20.10+ (опционально, для полного стека)
- **Docker Compose** 2.0+ (опционально)
- **PostgreSQL** 15+ (или через Docker)
- **Redis** 7+ (или через Docker)

---

## ⚡ Быстрый старт

### Вариант 1: Локальный запуск

```bash
# 1. Клонировать репозиторий
git clone <repository-url>
cd PREPODAVAI

# 2. Установить зависимости
npm run install:all

# 3. Настроить переменные окружения
# Создать backend/.env (см. пример ниже)

# 4. Запустить PostgreSQL и Redis (через Docker или локально)
docker-compose up -d postgres redis

# 5. Применить миграции
cd backend
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed

# 6. Запустить все сервисы
cd ..
npm run dev
```

### Вариант 2: Docker Compose (рекомендуется)

```bash
# 1. Клонировать репозиторий
git clone <repository-url>
cd PREPODAVAI

# 2. Создать .env файл в корне проекта
cat > .env << 'EOF'
POSTGRES_USER=prepodavai
POSTGRES_PASSWORD=your_secure_password
POSTGRES_DB=prepodavai
JWT_SECRET=your-jwt-secret-min-32-chars
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
N8N_WEBHOOK_URL=https://your-n8n-instance.com
CORS_ORIGIN=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_TELEGRAM_BOT_NAME=your_bot_name
EOF

# 3. Запустить все сервисы
docker-compose up -d

# 4. Применить миграции
docker-compose exec backend npm run prisma:migrate deploy
docker-compose exec backend npm run prisma:seed
```

После запуска:
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:3001/api
- **Health Check**: http://localhost:3001/api/health

---

## ⚙️ Настройка переменных окружения

### Backend (.env)

```env
# Database
DATABASE_URL=postgresql://prepodavai:password@localhost:5432/prepodavai
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your-super-secret-jwt-key-min-32-chars
JWT_EXPIRES_IN=7d

# Server
PORT=3001
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000

# Telegram
TELEGRAM_BOT_TOKEN=your_telegram_bot_token

# API Keys
OPENAI_API_KEY=your_openai_key
GAMMA_API_KEY=your_gamma_key

# Webhooks
N8N_WEBHOOK_URL=https://your-n8n-instance.com
WEBHOOK_SECRET=your-webhook-secret-min-32-chars

# Admin (для production)
ADMIN_USER_IDS=user-id-1,user-id-2

# Redis (для production)
REDIS_PASSWORD=your-redis-password
```

### Frontend (.env.local)

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_TELEGRAM_BOT_NAME=your_bot_name
```

---

## 🚢 Деплой в production

### Docker Compose (рекомендуется)

```bash
# 1. Настроить .env с production значениями
# 2. Собрать и запустить
docker-compose -f docker-compose.prod.yml build
docker-compose -f docker-compose.prod.yml up -d

# 3. Применить миграции
docker-compose -f docker-compose.prod.yml exec backend npm run prisma:migrate deploy
```

### Облачные платформы

- **Railway** — автоматический деплой из Git
- **Fly.io** — деплой отдельных сервисов
- **Vercel** — деплой frontend
- **DigitalOcean** — управляемые PostgreSQL и Redis

Подробнее см. документацию в `docs/` директории.

---

## 🔒 Безопасность

Проект включает комплексные меры безопасности:

- ✅ **JWT аутентификация** с проверкой подписи Telegram initData
- ✅ **Защита webhook endpoints** через WebhookAuthGuard
- ✅ **Защита admin endpoints** через AdminGuard
- ✅ **Валидация файлов** — проверка MIME типов, расширений, размера
- ✅ **Защита от path traversal** в работе с файлами
- ✅ **Helmet.js** — защита HTTP заголовков
- ✅ **CORS валидация** — запрет `*` в production
- ✅ **Глобальный exception filter** — санитизация ошибок
- ✅ **Rate limiting** — защита от DDoS
- ✅ **Prisma ORM** — защита от SQL инъекций

### Важные настройки для production:

1. Установите `WEBHOOK_SECRET` для защиты webhook endpoints
2. Установите `ADMIN_USER_IDS` для доступа к admin панели
3. Установите `REDIS_PASSWORD` для защиты Redis
4. Используйте сильные пароли для всех сервисов
5. Настройте HTTPS через Nginx и Let's Encrypt

---

## 📡 API Endpoints

### Аутентификация
- `POST /api/auth/validate-init-data` — валидация Telegram initData
- `POST /api/auth/login-with-api-key` — вход по API ключу

### Генерации
- `POST /api/generate/worksheet` — генерация рабочего листа
- `POST /api/generate/quiz` — генерация теста
- `POST /api/generate/vocabulary` — генерация словаря
- `POST /api/generate/lesson-plan` — генерация плана урока
- `POST /api/generate/image` — генерация изображения
- `POST /api/generate/presentation` — генерация презентации
- `POST /api/generate/transcribe-video` — транскрипция видео
- `GET /api/generate/history` — история генераций
- `GET /api/generate/:requestId` — статус генерации

### Файлы
- `POST /api/files/upload` — загрузка файла
- `GET /api/files/:hash` — получение файла
- `DELETE /api/files/:hash` — удаление файла

### Подписки
- `GET /api/subscriptions/me` — информация о подписке
- `GET /api/subscriptions/credits` — баланс кредитов

### Webhooks (для n8n)
- `POST /api/webhooks/*-callback` — callback endpoints для генераций

Все endpoints требуют JWT аутентификации, кроме webhook endpoints (защищены WebhookAuthGuard).

Подробнее: [API.md](./docs/API.md)

---

## 🧪 Разработка

### Запуск в режиме разработки

```bash
# Все сервисы одновременно
npm run dev

# Или отдельно:
npm run dev:frontend   # Frontend на http://localhost:3000
npm run dev:backend   # Backend на http://localhost:3001
npm run dev:worker    # Worker
npm run dev:bot       # Telegram Bot
```

### Полезные команды

```bash
# База данных
npm run db:migrate    # Применить миграции
npm run db:generate   # Сгенерировать Prisma Client
npm run db:studio     # Открыть Prisma Studio

# Сборка
npm run build         # Собрать все сервисы
npm run build:frontend
npm run build:backend

# Линтинг
npm run lint          # Проверить код
npm run lint:frontend
npm run lint:backend

# Тестирование
npm run test          # Запустить тесты
```

### Структура модулей

Каждый модуль в `backend/src/modules/` содержит:
- `*.controller.ts` — HTTP endpoints
- `*.service.ts` — бизнес-логика
- `*.module.ts` — конфигурация модуля
- `guards/` — guards для защиты endpoints
- `dto/` — Data Transfer Objects (рекомендуется)

---

## 📚 Документация

- [Архитектура](./docs/ARCHITECTURE.md) — архитектура системы
- [API Документация](./docs/API.md) — описание API endpoints
- [Руководство разработчика](./docs/DEVELOPMENT.md) — для разработчиков
- [Быстрый старт](./docs/QUICK_START.md) — детальные инструкции
- [Миграция](./docs/MIGRATION.md) — план миграции с Chatium

---

## 🎯 Ключевые особенности

### Масштабируемость
- Горизонтальное масштабирование всех сервисов
- Асинхронная обработка через очереди BullMQ
- Все генерации через webhooks (n8n)

### Генерации через Webhooks
Все типы генераций работают асинхронно через n8n webhooks:
- Текстовые генерации → `/api/webhooks/*-callback`
- Изображения → `/api/webhooks/image-callback`
- Презентации → `/api/webhooks/presentation-callback`
- Транскрипции → `/api/webhooks/transcription-callback`

### Система кредитов
- Автоматическая проверка перед генерацией
- Поддержка овереджа для платных планов
- Детальное логирование транзакций
- Гибкая система тарифных планов

### Telegram интеграция
- Telegram Mini App для удобного доступа
- Telegram Bot для уведомлений
- Автоматическая отправка результатов в Telegram

---

## 🐛 Решение проблем

### Проблемы с подключением к БД

```bash
# Проверить статус PostgreSQL
docker-compose ps postgres

# Проверить подключение
cd backend
npm run prisma:studio
```

### Проблемы с миграциями

```bash
# Сбросить миграции (⚠️ удалит данные!)
cd backend
npm run prisma:migrate reset

# Применить миграции заново
npm run prisma:migrate
```

### Проблемы с портами

```bash
# Проверить занятые порты
lsof -i :3000  # Frontend
lsof -i :3001  # Backend
lsof -i :5432  # PostgreSQL
lsof -i :6379  # Redis
```

### Просмотр логов

```bash
# Docker Compose
docker-compose logs -f backend
docker-compose logs -f frontend

# Production
docker-compose -f docker-compose.prod.yml logs -f
```

---

## 🤝 Вклад в проект

Мы приветствуем вклад в развитие проекта! Пожалуйста:

1. Создайте fork проекта
2. Создайте ветку для новой функции (`git checkout -b feature/amazing-feature`)
3. Закоммитьте изменения (`git commit -m 'Add amazing feature'`)
4. Запушьте в ветку (`git push origin feature/amazing-feature`)
5. Откройте Pull Request

---

## 📝 Лицензия

Этот проект лицензирован под MIT License.

---

## 📞 Поддержка

При возникновении проблем:

1. Проверьте [документацию](./docs/)
2. Проверьте логи: `docker-compose logs`
3. Проверьте миграции: `npm run db:migrate`
4. Откройте issue в репозитории

---

## 🙏 Благодарности

- OpenAI за API для генераций
- Gamma AI за API презентаций
- n8n за автоматизацию webhooks
- Telegram за платформу Mini Apps

---

<div align="center">

**Сделано с ❤️ для преподавателей**

[Документация](./docs/) • [API](./docs/API.md) • [Разработка](./docs/DEVELOPMENT.md)

</div>
