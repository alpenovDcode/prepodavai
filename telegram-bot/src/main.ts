import { Bot, Context } from 'grammy';
import * as dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';

dotenv.config();

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN || '');
const prisma = new PrismaClient();

/**
 * Генерация API ключа
 */
function generateApiKey(): string {
  return crypto.randomBytes(16).toString('hex');
}

// Обработка команды /start
bot.command('start', async (ctx: Context) => {
  const user = ctx.from;
  if (!user) {
    // await ctx.reply('❌ Ошибка: не удалось получить данные пользователя');
    return;
  }

  try {
    const telegramId = user.id.toString();
    const username = user.username || undefined;
    const firstName = user.first_name || '';
    const lastName = user.last_name || '';
    const chatId = ctx.chat?.id.toString() || telegramId;

    // Ищем существующего пользователя
    const appUser = await prisma.appUser.findUnique({
      where: { telegramId },
    });

    if (appUser) {
      // Пользователь уже существует
      // Обновляем последний доступ и имя
      await prisma.appUser.update({
        where: { id: appUser.id },
        data: {
          username: username || appUser.username,
          firstName: firstName || appUser.firstName,
          lastName: lastName || appUser.lastName,
          chatId,
          lastAccessAt: new Date(),
          lastTelegramAppAccess: new Date(),
        },
      });

      await ctx.reply(
        `С возвращением в prepodavAI! 🎓\n\n` +
        `Я твой интеллектуальный помощник.\n` +
        `Открой Mini App для начала работы! 👇`
      );
    } else {
      // Нового пользователя НЕ создаем
      await ctx.reply(
        `К сожалению, регистрация новых пользователей временно закрыта. 🔒\n\n` +
        `Следите за новостями проекта!`
      );
    }

    console.log(`✅ User handled: ${telegramId} (${username})`);
  } catch (error: any) {
    console.error('❌ Error handling /start command:', error);
    await ctx.reply(
      '❌ Произошла ошибка при обработке команды. Пожалуйста, попробуйте позже.'
    );
  }
});

// Запуск бота
bot.start();
console.log('🤖 Telegram bot started');

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 Shutting down gracefully...');
  bot.stop();
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🛑 Shutting down gracefully...');
  bot.stop();
  await prisma.$disconnect();
  process.exit(0);
});

