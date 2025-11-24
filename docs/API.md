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

### GigaChat

#### GET /gigachat/models
Получить сгруппированный список моделей GigaChat по типам (chat/image/audio/embeddings). Требует авторизации.

**Response:**
```json
{
  "success": true,
  "models": {
    "chat": [{ "id": "GigaChat-Pro", "label": "GigaChat-Pro" }],
    "image": [{ "id": "GigaChat-Image", "label": "GigaChat-Image" }],
    "audio": [{ "id": "GigaChat-Audio", "label": "GigaChat-Audio" }],
    "embeddings": [{ "id": "GigaChat-Embedding", "label": "GigaChat-Embedding" }]
  }
}
```

#### POST /gigachat/generate
Прямая генерация через API GigaChat. Поддерживаются режимы `chat`, `image`, `embeddings`, `audio_speech`, `audio_transcription`, `audio_translation`.

**Request (пример текстового запроса):**
```json
{
  "mode": "chat",
  "model": "GigaChat-Pro",
  "systemPrompt": "Ты внимательный ассистент учителя",
  "userPrompt": "Составь план урока по теме электричество",
  "temperature": 0.8,
  "maxTokens": 1200
}
```

**Request (пример генерации изображения):**
```json
{
  "mode": "image",
  "model": "GigaChat-Image",
  "prompt": "Учитель объясняет тему в современном классе",
  "negativePrompt": "низкое качество",
  "size": "1024x1024",
  "quality": "high"
}
```

**Request (пример TTS):**
```json
{
  "mode": "audio_speech",
  "model": "GigaChat-Audio",
  "inputText": "Добрый день! Сегодня говорим о дробях.",
  "voice": "BYS",
  "audioFormat": "mp3",
  "audioSpeed": 1
}
```

**Response:**
```json
{
  "success": true,
  "requestId": "uuid",
  "status": "pending"
}
```

Детали результата доступны по стандартному эндпоинту `GET /generate/:requestId` и содержат поля `content`, `imageUrl`, `audioUrl`, `embedding` в зависимости от режима.

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

