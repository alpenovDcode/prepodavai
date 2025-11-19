import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

/**
 * Скрипт для создания администратора
 * 
 * Использование:
 *   ts-node scripts/create-admin-user.ts
 * 
 * Или через Docker:
 *   docker exec prepodavai-backend ts-node scripts/create-admin-user.ts
 */
async function createAdminUser() {
  console.log('🔧 Создание администратора...\n');

  const adminData = {
    username: 'prepodavai_esvasileva',
    apiKey: 'stA-ud3-sKv-4gT', // Используем указанный пароль как API key
    firstName: 'Admin',
    lastName: 'User',
    source: 'web' as const,
  };

  // Проверяем, существует ли пользователь
  const existingUser = await prisma.appUser.findFirst({
    where: {
      OR: [
        { username: adminData.username },
        { apiKey: adminData.apiKey },
      ],
    },
  });

  if (existingUser) {
    // Обновляем существующего пользователя
    const user = await prisma.appUser.update({
      where: { id: existingUser.id },
      data: {
        username: adminData.username,
        apiKey: adminData.apiKey,
        firstName: adminData.firstName,
        lastName: adminData.lastName,
        source: adminData.source,
        lastAccessAt: new Date(),
      },
    });

    console.log('✅ Администратор обновлен:');
    console.log(`   ID: ${user.id}`);
    console.log(`   Username: ${user.username}`);
    console.log(`   API Key: ${user.apiKey}`);
    console.log(`\n📋 Добавьте в ADMIN_USER_IDS: ${user.id}`);
  } else {
    // Создаем нового пользователя
    const userHash = `admin_${crypto.randomBytes(8).toString('hex')}`;
    
    const user = await prisma.appUser.create({
      data: {
        username: adminData.username,
        apiKey: adminData.apiKey,
        firstName: adminData.firstName,
        lastName: adminData.lastName,
        source: adminData.source,
        userHash: userHash,
        lastAccessAt: new Date(),
      },
    });

    console.log('✅ Администратор создан:');
    console.log(`   ID: ${user.id}`);
    console.log(`   Username: ${user.username}`);
    console.log(`   API Key: ${user.apiKey}`);
    console.log(`   User Hash: ${user.userHash}`);
    console.log(`\n📋 Добавьте в ADMIN_USER_IDS: ${user.id}`);
  }

  // Получаем или создаем план для админа
  let plan = await prisma.subscriptionPlan.findUnique({
    where: { planKey: 'business' },
  });

  if (!plan) {
    plan = await prisma.subscriptionPlan.findUnique({
      where: { planKey: 'pro' },
    });
  }

  if (!plan) {
    plan = await prisma.subscriptionPlan.findUnique({
      where: { planKey: 'starter' },
    });
  }

  if (plan) {
    // Создаем или обновляем подписку для админа
    const user = existingUser 
      ? existingUser
      : await prisma.appUser.findFirst({ where: { username: adminData.username } });

    if (user) {
      const subscription = await prisma.userSubscription.upsert({
        where: { userId: user.id },
        update: {
          creditsBalance: 100000, // Много кредитов для админа
          status: 'active',
        },
        create: {
          userId: user.id,
          planId: plan.id,
          status: 'active',
          creditsBalance: 100000, // Много кредитов для админа
          extraCredits: 0,
          creditsUsed: 0,
          overageCreditsUsed: 0,
          startDate: new Date(),
          endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 год
          autoRenew: true,
        },
      });

      console.log(`✅ Подписка создана/обновлена: ${subscription.creditsBalance} кредитов`);
    }
  }

  const finalUser = await prisma.appUser.findFirst({
    where: { username: adminData.username },
  });

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔑 Данные для входа в админ-панель:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Username: ${finalUser?.username}`);
  console.log(`API Key: ${finalUser?.apiKey}`);
  console.log(`User ID: ${finalUser?.id}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`\n⚠️  Важно: Добавьте в переменные окружения backend:`);
  console.log(`ADMIN_USER_IDS=${finalUser?.id}`);
  console.log('\n✅ Готово!');
}

createAdminUser()
  .catch((e) => {
    console.error('❌ Ошибка:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

