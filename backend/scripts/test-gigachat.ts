/**
 * Скрипт для тестирования интеграции GigaChat
 * 
 * Использование:
 *   ts-node scripts/test-gigachat.ts
 * 
 * Или с параметрами:
 *   ts-node scripts/test-gigachat.ts --userId=USER_ID --token=JWT_TOKEN
 */

import axios from 'axios';
import * as readline from 'readline';

const API_URL = process.env.API_URL || 'http://localhost:3001/api';
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

interface TestResult {
  name: string;
  success: boolean;
  error?: string;
  data?: any;
}

const results: TestResult[] = [];

function question(query: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
}

async function testEndpoint(
  name: string,
  method: 'GET' | 'POST',
  endpoint: string,
  token: string,
  data?: any,
): Promise<TestResult> {
  try {
    const config: any = {
      method,
      url: `${API_URL}${endpoint}`,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    };

    if (data && method === 'POST') {
      config.data = data;
    }

    const response = await axios(config);
    return {
      name,
      success: response.status >= 200 && response.status < 300,
      data: response.data,
    };
  } catch (error: any) {
    return {
      name,
      success: false,
      error: error.response?.data?.error || error.message,
      data: error.response?.data,
    };
  }
}

async function waitForCompletion(token: string, requestId: string, maxAttempts = 30): Promise<TestResult> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((resolve) => setTimeout(resolve, 2000)); // Ждём 2 секунды

    const status = await testEndpoint(
      `Проверка статуса (попытка ${i + 1}/${maxAttempts})`,
      'GET',
      `/generate/${requestId}`,
      token,
    );

    if (!status.success) {
      return status;
    }

    const resultStatus = status.data?.status?.status || status.data?.status;
    if (resultStatus === 'completed') {
      return {
        name: 'Генерация завершена',
        success: true,
        data: status.data,
      };
    }

    if (resultStatus === 'failed') {
      return {
        name: 'Генерация завершена с ошибкой',
        success: false,
        error: status.data?.status?.error || status.data?.error,
        data: status.data,
      };
    }
  }

  return {
    name: 'Таймаут ожидания',
    success: false,
    error: 'Превышено время ожидания',
  };
}

async function runTests() {
  console.log('🧪 Тестирование интеграции GigaChat\n');
  console.log(`API URL: ${API_URL}\n`);

  // Получаем токен
  const token = process.argv.find((arg) => arg.startsWith('--token='))?.split('=')[1];
  let jwtToken = token;

  if (!jwtToken) {
    const username = await question('Введите username (или нажмите Enter для пропуска): ');
    if (username) {
      const apiKey = await question('Введите API key: ');
      try {
        const response = await axios.post(`${API_URL}/auth/login-with-api-key`, {
          username,
          apiKey,
        });
        jwtToken = response.data.token;
        console.log('✅ Авторизация успешна\n');
      } catch (error: any) {
        console.error('❌ Ошибка авторизации:', error.response?.data?.error || error.message);
        console.log('\n💡 Используйте: ts-node scripts/test-gigachat.ts --token=YOUR_JWT_TOKEN');
        process.exit(1);
      }
    } else {
      jwtToken = await question('Введите JWT токен: ');
    }
  }

  if (!jwtToken) {
    console.error('❌ Токен обязателен для тестирования');
    process.exit(1);
  }

  // Тест 1: Получение списка моделей
  console.log('📋 Тест 1: Получение списка моделей...');
  const modelsTest = await testEndpoint('Получение моделей', 'GET', '/gigachat/models', jwtToken);
  results.push(modelsTest);
  if (modelsTest.success) {
    console.log('✅ Модели получены:', Object.keys(modelsTest.data?.models || {}).join(', '));
  } else {
    console.log('❌ Ошибка:', modelsTest.error);
  }
  console.log('');

  // Тест 2: Текстовая генерация
  console.log('💬 Тест 2: Текстовая генерация (chat)...');
  const chatTest = await testEndpoint(
    'Текстовая генерация',
    'POST',
    '/gigachat/generate',
    jwtToken,
    {
      mode: 'chat',
      userPrompt: 'Привет! Скажи коротко о себе.',
      maxTokens: 100,
    },
  );
  results.push(chatTest);
  if (chatTest.success && chatTest.data?.requestId) {
    console.log('✅ Запрос создан, requestId:', chatTest.data.requestId);
    const completionTest = await waitForCompletion(jwtToken, chatTest.data.requestId);
    results.push(completionTest);
    if (completionTest.success) {
      const content = completionTest.data?.status?.result?.content || completionTest.data?.result?.content;
      console.log('✅ Результат:', content?.substring(0, 100) + '...');
    } else {
      console.log('❌ Ошибка генерации:', completionTest.error);
    }
  } else {
    console.log('❌ Ошибка:', chatTest.error);
  }
  console.log('');

  // Тест 3: Генерация изображения (опционально, может быть долго)
  const testImage = await question('Тестировать генерацию изображения? (y/n, по умолчанию n): ');
  if (testImage.toLowerCase() === 'y') {
    console.log('🖼️  Тест 3: Генерация изображения...');
    const imageTest = await testEndpoint(
      'Генерация изображения',
      'POST',
      '/gigachat/generate',
      jwtToken,
      {
        mode: 'image',
        prompt: 'Классная комната с доской',
        size: '1024x1024',
      },
    );
    results.push(imageTest);
    if (imageTest.success && imageTest.data?.requestId) {
      console.log('✅ Запрос создан, requestId:', imageTest.data.requestId);
      const completionTest = await waitForCompletion(jwtToken, imageTest.data.requestId, 60);
      results.push(completionTest);
      if (completionTest.success) {
        const imageUrl = completionTest.data?.status?.result?.imageUrl;
        console.log('✅ Изображение сгенерировано:', imageUrl ? 'URL получен' : 'URL не найден');
      } else {
        console.log('❌ Ошибка генерации:', completionTest.error);
      }
    } else {
      console.log('❌ Ошибка:', imageTest.error);
    }
    console.log('');
  }

  // Итоги
  console.log('\n📊 Итоги тестирования:');
  console.log('='.repeat(50));
  const successCount = results.filter((r) => r.success).length;
  const totalCount = results.length;
  results.forEach((result) => {
    const icon = result.success ? '✅' : '❌';
    console.log(`${icon} ${result.name}`);
    if (!result.success && result.error) {
      console.log(`   Ошибка: ${result.error}`);
    }
  });
  console.log('='.repeat(50));
  console.log(`Успешно: ${successCount}/${totalCount}`);

  if (successCount === totalCount) {
    console.log('\n🎉 Все тесты пройдены успешно!');
  } else {
    console.log('\n⚠️  Некоторые тесты не прошли. Проверьте логи выше.');
  }

  rl.close();
}

runTests().catch((error) => {
  console.error('❌ Критическая ошибка:', error);
  rl.close();
  process.exit(1);
});

