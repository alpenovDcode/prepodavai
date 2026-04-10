# Миграция с Chatium на новый стек

## Обзор миграции

Проект мигрирует с платформы Chatium на современный стек:
- **Frontend**: Next.js 14+ (App Router) + React 18+ + TypeScript
- **Backend**: NestJS + PostgreSQL + Prisma
- **Очереди**: BullMQ + Redis
- **Интеграции**: Telegram Bot API, OpenAI, Gamma AI, n8n Webhooks

## Ключевые изменения

### 1. Архитектура

**Было (Chatium):**
- Монолитная платформа Chatium
- Heap таблицы (проприетарная БД)
- Chatium Jobs для фоновых задач
- Встроенная авторизация

**Стало:**
- Модульная архитектура (frontend/backend/worker)
- PostgreSQL + Prisma ORM
- BullMQ для очередей
- JWT авторизация

### 2. Генерации через Webhooks

**Важно:** Все генерации работают через n8n webhooks (без изменений)

- Запрос → Backend → n8n Webhook (async)
- n8n обрабатывает → Callback в Backend
- Backend обновляет статус → Queue для отправки в Telegram

### 3. База данных

**Миграция схемы:**
- `app_users` → `AppUser` (Prisma)
- `user_generations` → `UserGeneration` (Prisma)
- `generation_requests` → `GenerationRequest` (Prisma)
- `user_subscriptions` → `UserSubscription` (Prisma)
- `subscription_plans` → `SubscriptionPlan` (Prisma)
- `credit_costs` → `CreditCost` (Prisma)
- `credit_transactions` → `CreditTransaction` (Prisma)
- `system_logs` → `SystemLog` (Prisma)

### 4. API Endpoints

**Структура API:**
```
/api/generate/:type          - Создание генерации
/api/generate/:requestId     - Статус генерации
/api/generate/history/list   - История генераций
/api/webhooks/:type-callback - Callback от n8n
/api/subscription/info       - Информация о подписке
/api/subscription/plans      - Доступные тарифы
/api/subscription/costs      - Стоимость операций
/api/auth/*                  - Авторизация
/api/users/*                 - Пользователи
```

## План миграции

### Этап 1: Подготовка (✅ Завершено)
- [x] Создание структуры проекта
- [x] Настройка Prisma схем
- [x] Настройка Docker Compose
- [x] Базовая структура NestJS

### Этап 2: Backend Core (🔄 В процессе)
- [x] Модуль генераций
- [x] Модуль подписок
- [ ] Модуль авторизации
- [ ] Модуль Telegram
- [ ] Модуль пользователей
- [ ] Модуль логов

### Этап 3: Frontend (⏳ Ожидает)
- [ ] Next.js структура
- [ ] Компоненты UI
- [ ] Интеграция с API
- [ ] Telegram WebApp
- [ ] Модули генерации

### Этап 4: Worker (⏳ Ожидает)
- [ ] BullMQ настройка
- [ ] Processors для очередей
- [ ] Отправка в Telegram

### Этап 5: Миграция данных (⏳ Ожидает)
- [ ] Экспорт данных из Chatium
- [ ] Импорт в PostgreSQL
- [ ] Валидация данных

### Этап 6: Тестирование (⏳ Ожидает)
- [ ] Unit тесты
- [ ] E2E тесты
- [ ] Интеграционные тесты

## Инструкции по запуску

### Локальная разработка

```bash
# 1. Клонировать репозиторий
git clone <repo-url>
cd PREPODAVAI

# 2. Установить зависимости
npm run install:all

# 3. Настроить .env файлы
cp .env.example .env
# Заполнить переменные окружения

# 4. Запустить Docker Compose
docker-compose up -d

# 5. Применить миграции Prisma
cd backend
npm run prisma:migrate

# 6. Запустить приложение
npm run dev
```

### Production деплой

```bash
# Build
npm run build

# Запуск через Docker Compose
docker-compose -f docker-compose.prod.yml up -d
```

## Совместимость

### Сохранена совместимость:
- ✅ Все типы генераций работают через webhooks
- ✅ Структура данных генераций
- ✅ Система Токенов и подписок
- ✅ Telegram интеграция

### Изменения:
- ⚠️ API endpoints изменились (добавлен префикс `/api`)
- ⚠️ Структура ответов может отличаться
- ⚠️ Авторизация через JWT вместо Chatium auth

## Поддержка

При возникновении проблем:
1. Проверить логи: `docker-compose logs`
2. Проверить миграции: `npm run db:migrate`
3. Проверить подключение к БД: `npm run db:studio`

