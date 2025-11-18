# API Документация PrepodavAI

## Базовый URL

```
Development: http://localhost:3001/api
Production: https://your-domain.com/api
```

## Авторизация

Все защищенные endpoints требуют JWT токен в заголовке:

```
Authorization: Bearer <token>
```

## Endpoints

### Авторизация

#### POST /auth/validate-init-data
Валидация Telegram initData

**Request:**
```json
{
  "initData": "user=..."
}
```

**Response:**
```json
{
  "success": true,
  "userHash": "uuid",
  "token": "jwt-token",
  "user": { ... }
}
```

#### POST /auth/login-with-api-key
Авторизация через username + API key

**Request:**
```json
{
  "username": "user123",
  "apiKey": "abc123..."
}
```

### Генерации

#### POST /generate/worksheet
Создание рабочего листа

**Request:**
```json
{
  "subject": "Математика",
  "topic": "Дроби",
  "level": "5",
  "questionsCount": 10
}
```

#### POST /generate/quiz
Создание теста

#### POST /generate/vocabulary
Создание словаря

#### POST /generate/lesson-plan
Создание плана урока

#### POST /generate/image
Генерация изображения

**Request:**
```json
{
  "prompt": "Классная комната",
  "style": "realistic"
}
```

#### POST /generate/presentation
Генерация презентации

#### POST /generate/transcribe-video
Транскрибация видео

#### GET /generate/:requestId
Получить статус генерации

#### GET /generate/history/list
История генераций

**Query params:**
- `limit` (default: 50)
- `offset` (default: 0)

### Подписки

#### GET /subscription/info
Информация о подписке пользователя

#### GET /subscription/plans
Список доступных тарифов

#### GET /subscription/costs
Стоимость операций

### Webhooks (для n8n)

#### POST /webhooks/worksheet-callback
#### POST /webhooks/quiz-callback
#### POST /webhooks/image-callback
#### POST /webhooks/presentation-callback
#### POST /webhooks/transcription-callback

**Request:**
```json
{
  "generationRequestId": "uuid",
  "success": true,
  "content": "...",
  "imageUrl": "...",
  "error": "..."
}
```

## Коды ошибок

- `400` - Bad Request (неверные параметры)
- `401` - Unauthorized (не авторизован)
- `403` - Forbidden (нет доступа)
- `404` - Not Found (ресурс не найден)
- `500` - Internal Server Error

