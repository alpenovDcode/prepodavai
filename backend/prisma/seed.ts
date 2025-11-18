import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as crypto from 'crypto';

// Загружаем .env файл
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

// Генерация API ключа
function generateApiKey(): string {
  return crypto.randomBytes(16).toString('hex');
}

async function main() {
  console.log('🌱 Seeding database...');

  // Инициализация тарифных планов
  const plans = [
    {
      planKey: 'starter',
      planName: 'Starter',
      monthlyCredits: 100,
      price: 0,
      currency: 'RUB',
      allowOverage: false,
      overageCostPerCredit: null,
      features: ['Базовая генерация текстов', 'Ограниченные изображения', 'История генераций'],
      isActive: true,
    },
    {
      planKey: 'pro',
      planName: 'Pro',
      monthlyCredits: 500,
      price: 990,
      currency: 'RUB',
      allowOverage: true,
      overageCostPerCredit: 2,
      features: [
        'Неограниченная генерация текстов',
        'Приоритетная обработка',
        'Больше изображений',
        'Фотосессии',
        'Презентации',
      ],
      isActive: true,
    },
    {
      planKey: 'business',
      planName: 'Business',
      monthlyCredits: 2000,
      price: 2990,
      currency: 'RUB',
      allowOverage: true,
      overageCostPerCredit: 1.5,
      features: [
        'Безлимитная генерация',
        'Максимальный приоритет',
        'Все возможности',
        'Транскрибация видео',
        'Поддержка 24/7',
      ],
      isActive: true,
    },
  ];

  for (const planData of plans) {
    await prisma.subscriptionPlan.upsert({
      where: { planKey: planData.planKey },
      update: {},
      create: planData,
    });
    console.log(`✅ Plan: ${planData.planKey}`);
  }

  // Инициализация стоимости операций
  const costs = [
    { operationType: 'text_generation', operationName: 'Генерация текста (короткая)', creditCost: 1, description: 'Короткие текстовые генерации', isActive: true },
    { operationType: 'worksheet', operationName: 'Рабочий лист', creditCost: 2, description: 'Создание рабочих листов', isActive: true },
    { operationType: 'quiz', operationName: 'Тест', creditCost: 2, description: 'Создание тестов', isActive: true },
    { operationType: 'vocabulary', operationName: 'Словарь', creditCost: 2, description: 'Создание словарей', isActive: true },
    { operationType: 'lesson_plan', operationName: 'План урока', creditCost: 3, description: 'Создание планов уроков', isActive: true },
    { operationType: 'feedback', operationName: 'Обратная связь', creditCost: 2, description: 'Генерация обратной связи', isActive: true },
    { operationType: 'content_adaptation', operationName: 'Адаптация контента', creditCost: 3, description: 'Адаптация учебного контента', isActive: true },
    { operationType: 'message', operationName: 'Сообщение родителям', creditCost: 1, description: 'Генерация сообщений', isActive: true },
    { operationType: 'image_generation', operationName: 'Генерация изображения', creditCost: 5, description: 'Создание изображений через AI', isActive: true },
    { operationType: 'photosession', operationName: 'Фотосессия', creditCost: 10, description: 'AI фотосессия', isActive: true },
    { operationType: 'presentation', operationName: 'Презентация', creditCost: 8, description: 'Создание презентаций', isActive: true },
    { operationType: 'transcription', operationName: 'Транскрибация видео', creditCost: 15, description: 'Транскрибация видео через Whisper', isActive: true },
  ];

  for (const costData of costs) {
    await prisma.creditCost.upsert({
      where: { operationType: costData.operationType },
      update: {},
      create: costData,
    });
    console.log(`✅ Cost: ${costData.operationType}`);
  }

  // Создание тестового пользователя для Telegram
  // Используем фиксированный API key для тестирования
  const testApiKey = 'test_api_key_1234567890abcdef1234567890abcdef';
  const testTelegramUser = await prisma.appUser.upsert({
    where: { telegramId: '123456789' }, // Тестовый Telegram ID
    update: {
      apiKey: testApiKey, // Обновляем на фиксированный API key
      username: 'test_user', // Убеждаемся, что username правильный
    },
    create: {
      telegramId: '123456789',
      chatId: '123456789', // Для личных чатов chatId = telegramId
      username: 'test_user',
      firstName: 'Тестовый',
      lastName: 'Пользователь',
      source: 'telegram',
      userHash: 'test_user_hash_' + Date.now(),
      apiKey: testApiKey, // Фиксированный API key для тестирования
      lastTelegramAppAccess: new Date(),
    },
  });
  console.log(`✅ Test Telegram User created: ${testTelegramUser.id}`);

  // Создание подписки для тестового пользователя
  const starterPlan = await prisma.subscriptionPlan.findUnique({
    where: { planKey: 'starter' },
  });

  if (starterPlan) {
    const testSubscription = await prisma.userSubscription.upsert({
      where: { userId: testTelegramUser.id },
      update: {
        creditsBalance: 10000, // 10000 кредитов для тестирования
        status: 'active',
      },
      create: {
        userId: testTelegramUser.id,
        planId: starterPlan.id,
        status: 'active',
        creditsBalance: 10000, // 10000 кредитов для тестирования
        extraCredits: 0,
        creditsUsed: 0,
        overageCreditsUsed: 0,
        startDate: new Date(),
        endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 год
        autoRenew: true,
      },
    });
    console.log(`✅ Test Subscription created: ${testSubscription.id}`);
    console.log(`💰 Кредитов на балансе: ${testSubscription.creditsBalance}`);
  }

  // Получаем обновленного пользователя с API key
  const userWithApiKey = await prisma.appUser.findUnique({
    where: { id: testTelegramUser.id },
  });

  console.log('\n📋 Тестовый пользователь для Telegram:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Telegram ID: ${userWithApiKey?.telegramId}`);
  console.log(`Username: @${userWithApiKey?.username}`);
  console.log(`Имя: ${userWithApiKey?.firstName} ${userWithApiKey?.lastName}`);
  console.log(`User Hash: ${userWithApiKey?.userHash}`);
  console.log(`User ID: ${userWithApiKey?.id}`);
  console.log(`API Key: ${userWithApiKey?.apiKey}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\n🔑 Данные для входа:');
  console.log(`   Username: ${userWithApiKey?.username}`);
  console.log(`   API Key: ${userWithApiKey?.apiKey}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\n💡 Для тестирования через Telegram Mini App:');
  console.log('1. Откройте Telegram бота');
  console.log('2. Используйте Telegram ID: 123456789');
  console.log('3. Или создайте тестовый initData с этими данными');
  console.log('\n✅ Seeding completed!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

