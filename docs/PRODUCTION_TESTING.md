# Тестирование GigaChat на продакшене

## 🚀 Быстрый тест после деплоя

### 1. Проверка доступности API

```bash
# Замените YOUR_DOMAIN на ваш домен
curl -X GET https://gigachat.devices.sberbank.ru/api/v1/models \
  -H "Authorization: Bearer YOUR_GIGACHAT_ACCESS_TOKEN" | jq .
```

**Ожидаемый ответ:**
```json
{
  "success": true,
  "models": {
    "chat": [...],
    "image": [...],
    "embeddings": [...],
    "audio": [...]
  }
}
```

### 2. Тест через веб-интерфейс

1. Откройте ваш домен в браузере
2. Авторизуйтесь
3. Выберите функцию **"GigaChat"**
4. Выберите режим **"Текстовая беседа"**
5. Введите простой промпт: `"Привет, как дела?"`
6. Нажмите **"Создать"**
7. Дождитесь результата (10-30 секунд)

### 3. Проверка логов

```bash
# Логи backend
docker logs prepodavai-backend-prod --tail 50 -f

# Ищите строки:
# ✅ GigaChat token получен
# 📤 Sending request to GigaChat API
# ✅ GigaChat generation completed
```

### 4. Проверка через API (если есть JWT токен)

```bash
# 1. Получить модели
curl -X GET https://YOUR_DOMAIN/api/gigachat/models \
  -H "Authorization: Bearer YOUR_GIGACHAT_ACCESS_TOKEN" \
  -H "Content-Type: application/json" | jq .

# 2. Создать текстовую генерацию
curl -X POST https://YOUR_DOMAIN/api/gigachat/generate \
  -H "Authorization: Bearer YOUR_GIGACHAT_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "chat",
    "userPrompt": "Привет! Расскажи коротко о себе.",
    "maxTokens": 100
  }' | jq .

# 3. Проверить статус (замените REQUEST_ID)
curl -X GET https://YOUR_DOMAIN/api/generate/REQUEST_ID \
  -H "Authorization: Bearer YOUR_GIGACHAT_ACCESS_TOKEN" | jq .
```

## 🔍 Проверка работоспособности

### Чек-лист

- [ ] Backend контейнер запущен: `docker ps | grep backend`
- [ ] Логи показывают успешный старт: `docker logs prepodavai-backend-prod | grep "Backend API запущен"`
- [ ] `GET /api/gigachat/models` возвращает список моделей
- [ ] `POST /api/gigachat/generate` создаёт запрос
- [ ] Генерация завершается со статусом `completed`
- [ ] Результат сохраняется в БД
- [ ] Результат отображается в истории на фронтенде
- [ ] Токены списываются корректно

### Проверка через Docker

```bash
# 1. Проверить, что контейнеры запущены
docker ps

# 2. Проверить логи backend
docker logs prepodavai-backend-prod --tail 100

# 3. Выполнить команду внутри контейнера (если нужно)
docker exec -it prepodavai-backend-prod sh

# 4. Проверить переменные окружения
docker exec prepodavai-backend-prod env | grep GIGACHAT
```

## 🐛 Диагностика проблем

### Проблема: "GIGACHAT_CLIENT_ID is required"

**Решение:**
1. Проверьте `.env` файл в корне проекта
2. Убедитесь, что переменные передаются в docker-compose.yml
3. Перезапустите контейнер:
   ```bash
   docker compose restart backend
   ```

### Проблема: "Failed to get GigaChat token"

**Решение:**
1. Проверьте правильность `GIGACHAT_CLIENT_ID` и `GIGACHAT_CLIENT_SECRET`
2. Проверьте доступность `GIGACHAT_AUTH_URL`:
   ```bash
   curl -v https://ngw.devices.sberbank.ru:9443/api/v2/oauth
   ```
3. Проверьте логи:
   ```bash
   docker logs prepodavai-backend-prod | grep -i gigachat
   ```

### Проблема: "TLS certificate verification failed"

**Решение:**
1. Для продакшена НЕ используйте `GIGACHAT_DISABLE_TLS_VERIFICATION=true`
2. Убедитесь, что сервер имеет доступ к корневым сертификатам
3. Если проблема сохраняется, проверьте сетевые настройки

### Проблема: Медленная генерация

**Это нормально!** GigaChat API может отвечать:
- Текст: 5-15 секунд
- Изображения: 15-30 секунд
- Аудио: 10-20 секунд

### Проблема: "Недостаточно Токенов"

**Решение:**
1. Проверьте баланс пользователя:
   ```bash
   curl -X GET https://YOUR_DOMAIN/api/subscriptions/me \
     -H "Authorization: Bearer YOUR_GIGACHAT_ACCESS_TOKEN" | jq .
   ```
2. Добавьте Токены через админку или скрипт

## 📊 Мониторинг

### Проверка метрик

```bash
# Количество запросов к GigaChat
docker logs prepodavai-backend-prod | grep -c "GigaChat"

# Успешные генерации
docker logs prepodavai-backend-prod | grep -c "GigaChat generation completed"

# Ошибки
docker logs prepodavai-backend-prod | grep -i "gigachat.*error"
```

### Проверка БД

```bash
# Подключиться к БД
docker exec -it prepodavai-postgres-prod psql -U prepodavai -d prepodavai

# Проверить последние GigaChat генерации
SELECT id, "generationType", status, "createdAt" 
FROM user_generations 
WHERE "generationType" LIKE 'gigachat%' 
ORDER BY "createdAt" DESC 
LIMIT 10;
```

## 🔐 Безопасность

### Важно для продакшена:

1. ✅ **НЕ** используйте `GIGACHAT_DISABLE_TLS_VERIFICATION=true` на проде
2. ✅ Используйте сильные секреты для `JWT_SECRET` (минимум 32 символа)
3. ✅ Храните `.env` файл в безопасном месте, не коммитьте в git
4. ✅ Ограничьте доступ к логам с секретами
5. ✅ Используйте HTTPS для всех API запросов

## 📝 Примеры тестовых запросов

### Текстовая генерация
```bash
curl -X POST https://YOUR_DOMAIN/api/gigachat/generate \
  -H "Authorization: Bearer YOUR_GIGACHAT_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "chat",
    "systemPrompt": "Ты опытный учитель",
    "userPrompt": "Создай план урока по математике",
    "temperature": 0.8,
    "maxTokens": 500
  }'
```

### Генерация изображения
```bash
curl -X POST https://YOUR_DOMAIN/api/gigachat/generate \
  -H "Authorization: Bearer YOUR_GIGACHAT_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "image",
    "prompt": "Классная комната с доской",
    "size": "1024x1024",
    "quality": "high"
  }'
```

### Эмбеддинги
```bash
curl -X POST https://YOUR_DOMAIN/api/gigachat/generate \
  -H "Authorization: Bearer YOUR_GIGACHAT_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "embeddings",
    "inputText": "Математика для 5 класса"
  }'
```

## ✅ Финальная проверка перед релизом

- [ ] Все тесты пройдены
- [ ] Логи не показывают ошибок
- [ ] Все режимы GigaChat работают
- [ ] Токены списываются корректно
- [ ] Результаты сохраняются в БД
- [ ] История генераций отображает GigaChat
- [ ] Нет утечек секретов в логах
- [ ] HTTPS настроен корректно
- [ ] TLS verification включен (`GIGACHAT_DISABLE_TLS_VERIFICATION=false`)

