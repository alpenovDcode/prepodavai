# Инструкция по тестированию интеграции GigaChat

## Подготовка

### 1. Настройка переменных окружения

Убедитесь, что в `backend/.env` (или скопируйте из `backend/env.example`) настроены все необходимые переменные:

```bash
# GigaChat API
GIGACHAT_CLIENT_ID="ваш-client-id"
GIGACHAT_CLIENT_SECRET="ваш-client-secret"
GIGACHAT_SCOPE="GIGACHAT_API_PERS"
GIGACHAT_AUTH_URL="https://ngw.devices.sberbank.ru:9443"
GIGACHAT_API_URL="https://gigachat.devices.sberbank.ru/api/v1"
GIGACHAT_DISABLE_TLS_VERIFICATION=false
```

### 2. Запуск сервисов

```bash
# Terminal 1: Backend
cd backend
npm run start:dev

# Terminal 2: Frontend
cd frontend
npm run dev
```

## Тестирование через API (Postman/curl)

### Шаг 1: Получение JWT токена

Сначала нужно авторизоваться. Есть два способа:

#### Вариант A: Через Telegram initData (если тестируете в Telegram)
```bash
curl -X POST http://localhost:3001/api/auth/validate-init-data \
  -H "Content-Type: application/json" \
  -d '{"initData": "ваш-telegram-init-data"}'
```

#### Вариант B: Через API ключ (для веб-тестирования)
```bash
curl -X POST http://localhost:3001/api/auth/login-with-api-key \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "apiKey": "ваш-api-key"
  }'
```

**Ответ:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "userHash": "uuid"
}
```

Сохраните `token` для следующих запросов.

### Шаг 2: Проверка получения списка моделей

```bash
curl -X GET http://localhost:3001/api/gigachat/models \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

**Ожидаемый ответ:**
```json
{
  "success": true,
  "models": {
    "chat": [
      { "id": "GigaChat", "label": "GigaChat" },
      { "id": "GigaChat-Pro", "label": "GigaChat-Pro" }
    ],
    "image": [
      { "id": "GigaChat-Image", "label": "GigaChat-Image" }
    ],
    "embeddings": [
      { "id": "GigaChat-Embedding", "label": "GigaChat-Embedding" }
    ],
    "audio": [
      { "id": "GigaChat-Audio", "label": "GigaChat-Audio" }
    ]
  }
}
```

### Шаг 3: Тестирование текстовой генерации (Chat)

```bash
curl -X POST http://localhost:3001/api/gigachat/generate \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "chat",
    "model": "GigaChat",
    "systemPrompt": "Ты опытный учитель-методист",
    "userPrompt": "Создай план урока по математике для 5 класса на тему 'Дроби'",
    "temperature": 0.8,
    "maxTokens": 1024
  }'
```

**Ожидаемый ответ:**
```json
{
  "success": true,
  "requestId": "uuid",
  "status": "pending"
}
```

### Шаг 4: Проверка статуса генерации

```bash
curl -X GET http://localhost:3001/api/generate/REQUEST_ID_HERE \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

**Ожидаемый ответ (завершено):**
```json
{
  "success": true,
  "requestId": "uuid",
  "status": {
    "status": "completed",
    "result": {
      "provider": "GigaChat",
      "mode": "chat",
      "model": "GigaChat",
      "content": "План урока...",
      "usage": { ... }
    }
  }
}
```

### Шаг 5: Тестирование генерации изображения

```bash
curl -X POST http://localhost:3001/api/gigachat/generate \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "image",
    "model": "GigaChat-Image",
    "prompt": "Классная комната с доской и партами, яркое освещение",
    "size": "1024x1024",
    "quality": "high"
  }'
```

### Шаг 6: Тестирование эмбеддингов

```bash
curl -X POST http://localhost:3001/api/gigachat/generate \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "embeddings",
    "model": "GigaChat-Embedding",
    "inputText": "Математика для 5 класса"
  }'
```

### Шаг 7: Тестирование текста в речь (TTS)

```bash
curl -X POST http://localhost:3001/api/gigachat/generate \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "audio_speech",
    "model": "GigaChat-Audio",
    "inputText": "Добро пожаловать на урок математики",
    "voice": "BYS",
    "audioFormat": "mp3"
  }'
```

**Ожидаемый результат:** В ответе будет `audioUrl` с data-URL для воспроизведения.

### Шаг 8: Тестирование транскрипции аудио

Сначала загрузите аудио файл:

```bash
curl -X POST http://localhost:3001/api/files/upload \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -F "file=@audio.mp3"
```

**Ответ:**
```json
{
  "success": true,
  "hash": "abc123...",
  "url": "http://localhost:3001/api/files/abc123..."
}
```

Затем используйте hash для транскрипции:

```bash
curl -X POST http://localhost:3001/api/gigachat/generate \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "audio_transcription",
    "model": "GigaChat-Audio",
    "audioHash": "abc123...",
    "language": "ru"
  }'
```

## Тестирование через веб-интерфейс

### 1. Откройте приложение
```
http://localhost:3000
```

### 2. Авторизуйтесь
- Если в Telegram: автоматически через initData
- Если в браузере: используйте API ключ

### 3. Выберите функцию "GigaChat"
- В списке функций найдите "GigaChat"
- Выберите режим (chat, image, embeddings, audio_speech, и т.д.)

### 4. Заполните поля
- **Для chat:** systemPrompt, userPrompt, temperature, maxTokens
- **Для image:** prompt, size, quality, negativePrompt (опционально)
- **Для embeddings:** inputText
- **Для audio_speech:** inputText, voice, audioFormat
- **Для audio_transcription/translation:** audioHash (сначала загрузите файл)

### 5. Нажмите "Создать"
- Проверьте, что кредиты списались
- Дождитесь завершения генерации
- Проверьте результат в истории

### 6. Проверьте историю генераций
- Перейдите в раздел "История"
- Найдите вашу генерацию GigaChat
- Откройте детали
- Проверьте отображение результата:
  - Текст для chat
  - Изображение для image
  - Аудио плеер для audio_speech
  - Текст для audio_transcription

## Проверка логов

### Backend логи
Следите за логами в терминале backend:

```
✅ GigaChat token получен
📤 Sending request to GigaChat API: chat/completions
✅ GigaChat generation completed: requestId=...
💳 Credits debited: userId=..., operationType=gigachat_text, cost=...
```

### Ошибки
Если видите ошибки:

1. **"GIGACHAT_CLIENT_ID is required"**
   - Проверьте `.env` файл
   - Убедитесь, что переменные загружены

2. **"Failed to get GigaChat token"**
   - Проверьте правильность CLIENT_ID и CLIENT_SECRET
   - Проверьте доступность `GIGACHAT_AUTH_URL`

3. **"TLS certificate verification failed"**
   - Установите `GIGACHAT_DISABLE_TLS_VERIFICATION=true` (только для тестирования!)
   - Или настройте правильные сертификаты

4. **"Недостаточно кредитов"**
   - Проверьте баланс: `GET /api/subscriptions/me`
   - Добавьте кредиты через админку или скрипт

## Автоматизированное тестирование

Создайте файл `test-gigachat.sh`:

```bash
#!/bin/bash

BASE_URL="http://localhost:3001/api"
TOKEN="YOUR_TOKEN_HERE"

echo "1. Получение списка моделей..."
curl -s -X GET "$BASE_URL/gigachat/models" \
  -H "Authorization: Bearer $TOKEN" | jq .

echo -e "\n2. Тест текстовой генерации..."
RESPONSE=$(curl -s -X POST "$BASE_URL/gigachat/generate" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "chat",
    "userPrompt": "Привет, как дела?",
    "maxTokens": 100
  }')

REQUEST_ID=$(echo $RESPONSE | jq -r '.requestId')
echo "Request ID: $REQUEST_ID"

echo -e "\n3. Ожидание завершения (10 секунд)..."
sleep 10

echo -e "\n4. Проверка статуса..."
curl -s -X GET "$BASE_URL/generate/$REQUEST_ID" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

Запуск:
```bash
chmod +x test-gigachat.sh
./test-gigachat.sh
```

## Чек-лист тестирования

- [ ] Backend запускается без ошибок
- [ ] Получение списка моделей работает
- [ ] Текстовая генерация (chat) работает
- [ ] Генерация изображений работает
- [ ] Эмбеддинги работают
- [ ] Текст в речь (TTS) работает
- [ ] Транскрипция аудио работает
- [ ] Перевод аудио работает
- [ ] Кредиты списываются корректно
- [ ] Результаты сохраняются в БД
- [ ] История генераций отображает GigaChat генерации
- [ ] Изображения отображаются в истории
- [ ] Аудио воспроизводится в истории
- [ ] Ошибки обрабатываются корректно
- [ ] Валидация полей работает

## Полезные команды

```bash
# Проверка баланса кредитов
curl -X GET http://localhost:3001/api/subscriptions/me \
  -H "Authorization: Bearer YOUR_TOKEN"

# История генераций
curl -X GET "http://localhost:3001/api/generate/history?limit=10" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Добавление кредитов (требует админских прав)
cd backend
npm run add-credits -- userId=USER_ID amount=100
```

## Troubleshooting

### Проблема: "Cannot find module 'form-data'"
```bash
cd backend
npm install form-data
```

### Проблема: "GigaChat module not found"
```bash
# Проверьте, что модуль подключен в app.module.ts
# Убедитесь, что файлы созданы в backend/src/modules/gigachat/
```

### Проблема: "401 Unauthorized"
- Проверьте, что токен не истёк
- Убедитесь, что заголовок `Authorization: Bearer TOKEN` отправляется
- Проверьте, что пользователь существует в БД

### Проблема: Медленные запросы
- GigaChat API может отвечать 10-30 секунд
- Это нормально для генерации изображений и больших текстов
- Увеличьте timeout в настройках axios (если нужно)

