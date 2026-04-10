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

  // ── Тарифные планы ─────────────────────────────────────────────────────────
  // update: обновляет данные при повторном запуске seed
  const plans = [
    {
      planKey: 'free',
      planName: 'Бесплатный',
      monthlyCredits: 30,
      price: 0,
      currency: 'RUB',
      allowOverage: false,
      overageCostPerCredit: null,
      features: [
        'Рабочий лист, тест, словарь',
        'Адаптация текста, план урока',
        'ИИ ассистент (10 запросов/день)',
        'История генераций',
      ],
      isActive: true,
    },
    {
      planKey: 'starter',
      planName: 'Стартер',
      monthlyCredits: 200,
      price: 290,
      currency: 'RUB',
      allowOverage: false,
      overageCostPerCredit: null,
      features: [
        'Рабочий лист, тест, словарь',
        'Адаптация текста, план урока',
        'Игры, ОГЭ/ЕГЭ, Распаковка экспертности',
        'Анализ видео, Презентации',
        'ИИ ассистент (50 запросов/день)',
      ],
      isActive: true,
    },
    {
      planKey: 'pro',
      planName: 'Про',
      monthlyCredits: 500,
      price: 690,
      currency: 'RUB',
      allowOverage: false,
      overageCostPerCredit: null,
      features: [
        'Всё из Стартера',
        'ИИ Генератор фото',
        'ИИ Фотосессия',
        'ИИ ассистент (безлимит)',
        'Перенос до 100 токенов на следующий месяц',
      ],
      isActive: true,
    },
    {
      planKey: 'business',
      planName: 'Бизнес',
      monthlyCredits: 1500,
      price: 1490,
      currency: 'RUB',
      allowOverage: true,
      overageCostPerCredit: 1.5,
      features: [
        'Всё из Про',
        'Перенос до 300 токенов на следующий месяц',
        'Приоритетная поддержка',
      ],
      isActive: true,
    },
  ];

  for (const planData of plans) {
    await prisma.subscriptionPlan.upsert({
      where: { planKey: planData.planKey },
      update: {
        planName: planData.planName,
        monthlyCredits: planData.monthlyCredits,
        price: planData.price,
        allowOverage: planData.allowOverage,
        overageCostPerCredit: planData.overageCostPerCredit,
        features: planData.features,
      },
      create: planData,
    });
    console.log(`✅ Plan: ${planData.planKey} — ${planData.price}р / ${planData.monthlyCredits} токенов`);
  }

  // ── Стоимость операций ──────────────────────────────────────────────────────
  // Значения соответствуют реальной себестоимости (см. юнит-экономику).
  // update: обновляет Токены при повторном запуске.
  const costs = [
    { operationType: 'text_generation', operationName: 'Генерация текста', creditCost: 1, description: 'Себест. ~1р', isActive: true },
    { operationType: 'message', operationName: 'Сообщение родителям', creditCost: 1, description: 'Себест. ~1р', isActive: true },
    { operationType: 'worksheet', operationName: 'Рабочий лист', creditCost: 3, description: 'Себест. ~1.5р', isActive: true },
    { operationType: 'quiz', operationName: 'Тест', creditCost: 3, description: 'Себест. ~1.5р', isActive: true },
    { operationType: 'vocabulary', operationName: 'Словарь', creditCost: 3, description: 'Себест. ~1.5р', isActive: true },
    { operationType: 'lesson_plan', operationName: 'План урока', creditCost: 3, description: 'Себест. ~1.5р', isActive: true },
    { operationType: 'feedback', operationName: 'Проверка ДЗ', creditCost: 3, description: 'Себест. ~1.5р', isActive: true },
    { operationType: 'content_adaptation', operationName: 'Адаптация текста', creditCost: 3, description: 'Себест. ~1.5–3р', isActive: true },
    { operationType: 'game_generation', operationName: 'Игра', creditCost: 15, description: 'Себест. ~1.5р', isActive: true },
    { operationType: 'exam_variant', operationName: 'Вариант ОГЭ/ЕГЭ', creditCost: 20, description: 'Себест. ~1.5р', isActive: true },
    { operationType: 'expert_unpacking', operationName: 'Распаковка экспертности', creditCost: 20, description: 'Себест. ~2р', isActive: true },
    { operationType: 'video_analysis', operationName: 'Анализ видео', creditCost: 15, description: 'Себест. ~5р', isActive: true },
    { operationType: 'transcription', operationName: 'Транскрибация видео', creditCost: 15, description: 'Себест. ~5р', isActive: true },
    { operationType: 'presentation', operationName: 'Презентация', creditCost: 50, description: 'Себест. ~3–15р', isActive: true },
    { operationType: 'image_generation', operationName: 'ИИ Генератор фото', creditCost: 15, description: 'Себест. ~12р', isActive: true },
    { operationType: 'photosession', operationName: 'ИИ Фотосессия', creditCost: 25, description: 'Себест. ~18р', isActive: true },
  ];

  for (const costData of costs) {
    await prisma.creditCost.upsert({
      where: { operationType: costData.operationType },
      update: {
        operationName: costData.operationName,
        creditCost: costData.creditCost,
        description: costData.description,
      },
      create: costData,
    });
    console.log(`✅ Cost: ${costData.operationType} — ${costData.creditCost} токенов`);
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
        creditsBalance: 10000, // 10000 Токенов для тестирования
        status: 'active',
      },
      create: {
        userId: testTelegramUser.id,
        planId: starterPlan.id,
        status: 'active',
        creditsBalance: 10000, // 10000 Токенов для тестирования
        extraCredits: 0,
        creditsUsed: 0,
        overageCreditsUsed: 0,
        startDate: new Date(),
        endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 год
        autoRenew: true,
      },
    });
    console.log(`✅ Test Subscription created: ${testSubscription.id}`);
    console.log(`💰 Токенов на балансе: ${testSubscription.creditsBalance}`);
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

