import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

/**
 * Скрипт для создания тестового пользователя с данными для входа через Telegram
 * 
 * Использование:
 *   ts-node scripts/create-test-user.ts
 * 
 * Или через Docker:
 *   docker exec prepodavai-backend ts-node scripts/create-test-user.ts
 */
async function createTestUser() {
  console.log('🔧 Создание тестового пользователя...\n');

  // Параметры тестового пользователя
  const testUserData = {
    telegramId: '123456789',
    chatId: '123456789',
    username: 'test_user',
    firstName: 'Тестовый',
    lastName: 'Пользователь',
    source: 'telegram' as const,
  };

  // Создаем или обновляем пользователя
  const user = await prisma.appUser.upsert({
    where: { telegramId: testUserData.telegramId },
    update: {
      username: testUserData.username,
      firstName: testUserData.firstName,
      lastName: testUserData.lastName,
      lastTelegramAppAccess: new Date(),
    },
    create: {
      ...testUserData,
      userHash: `test_${crypto.randomBytes(8).toString('hex')}`,
      lastTelegramAppAccess: new Date(),
    },
  });

  console.log('✅ Пользователь создан/обновлен:');
  console.log(`   ID: ${user.id}`);
  console.log(`   Telegram ID: ${user.telegramId}`);
  console.log(`   Username: @${user.username}`);
  console.log(`   User Hash: ${user.userHash}`);

  // Получаем или создаем план Starter
  let plan = await prisma.subscriptionPlan.findUnique({
    where: { planKey: 'starter' },
  });

  if (!plan) {
    plan = await prisma.subscriptionPlan.create({
      data: {
        planKey: 'starter',
        planName: 'Starter',
        monthlyCredits: 100,
        price: 0,
        currency: 'RUB',
        allowOverage: false,
        features: ['Базовая генерация текстов'],
        isActive: true,
      },
    });
    console.log('✅ Создан план Starter');
  }

  // Создаем или обновляем подписку
  const subscription = await prisma.userSubscription.upsert({
    where: { userId: user.id },
    update: {
      creditsBalance: 1000, // Много Токенов для тестирования
      status: 'active',
    },
    create: {
      userId: user.id,
      planId: plan.id,
      status: 'active',
      creditsBalance: 1000, // Много Токенов для тестирования
      extraCredits: 0,
      creditsUsed: 0,
      overageCreditsUsed: 0,
      startDate: new Date(),
      endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 год
      autoRenew: true,
    },
  });

  console.log('✅ Подписка создана/обновлена:');
  console.log(`   Токенов: ${subscription.creditsBalance}`);

  console.log('\n📋 Данные для входа через Telegram:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Telegram ID: ${user.telegramId}`);
  console.log(`Username: @${user.username}`);
  console.log(`Имя: ${user.firstName} ${user.lastName}`);
  console.log(`User Hash: ${user.userHash}`);
  console.log(`User ID: ${user.id}`);
  console.log(`Токенов: ${subscription.creditsBalance}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  console.log('\n💡 Как использовать:');
  console.log('1. В Telegram Mini App используйте initData с этими данными');
  console.log('2. Или создайте тестовый initData:');
  console.log(`   user={"id":${user.telegramId},"first_name":"${user.firstName}","last_name":"${user.lastName}","username":"${user.username}"}`);
  console.log('3. Отправьте POST запрос на /api/auth/validate-init-data');
  console.log('\n✅ Готово!');
}

createTestUser()
  .catch((e) => {
    console.error('❌ Ошибка:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

