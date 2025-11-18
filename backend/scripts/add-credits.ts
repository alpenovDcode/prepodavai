import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Загружаем .env файл
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

/**
 * Скрипт для добавления кредитов пользователю
 * 
 * Использование:
 *   ts-node scripts/add-credits.ts <username> <amount>
 * 
 * Пример:
 *   ts-node scripts/add-credits.ts test_user 10000
 */
async function addCredits() {
  const username = process.argv[2] || 'test_user';
  const amount = parseInt(process.argv[3] || '10000');
  const setExact = process.argv.includes('--set');

  console.log(`💰 ${setExact ? 'Установка' : 'Добавление'} ${amount} кредитов пользователю ${username}...\n`);

  // Находим пользователя
  const user = await prisma.appUser.findFirst({
    where: { username },
    include: { subscription: true },
  });

  if (!user) {
    console.error(`❌ Пользователь ${username} не найден`);
    process.exit(1);
  }

  if (!user.subscription) {
    console.error(`❌ У пользователя ${username} нет подписки`);
    process.exit(1);
  }

  // Обновляем баланс
  const updatedSubscription = await prisma.userSubscription.update({
    where: { userId: user.id },
    data: setExact
      ? { creditsBalance: amount }
      : { creditsBalance: { increment: amount } },
  });

  // Создаем транзакцию
  await prisma.creditTransaction.create({
    data: {
      userId: user.id,
      subscriptionId: user.subscription.id,
      type: 'grant',
      amount,
      balanceBefore: user.subscription.creditsBalance,
      balanceAfter: updatedSubscription.creditsBalance,
      description: `Добавлено ${amount} кредитов через скрипт`,
    },
  });

  console.log('✅ Кредиты добавлены:');
  console.log(`   Пользователь: ${user.username}`);
  console.log(`   Было: ${user.subscription.creditsBalance} кредитов`);
  console.log(`   Добавлено: ${amount} кредитов`);
  console.log(`   Стало: ${updatedSubscription.creditsBalance} кредитов`);
}

addCredits()
  .catch((e) => {
    console.error('❌ Ошибка:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

