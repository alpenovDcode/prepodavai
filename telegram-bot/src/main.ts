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
    return;
  }

  try {
    const telegramId = user.id.toString();
    const username = user.username || `user${user.id}`;
    const firstName = user.first_name || 'User';
    const lastName = user.last_name || '';
    const chatId = ctx.chat?.id.toString() || telegramId;

    // Ищем существующего пользователя
    let appUser = await prisma.appUser.findUnique({
      where: { telegramId },
    });

    if (appUser) {
      // Пользователь уже существует - обновляем данные
      appUser = await prisma.appUser.update({
        where: { id: appUser.id },
        data: {
          username: user.username || appUser.username,
          firstName: firstName || appUser.firstName,
          lastName: lastName || appUser.lastName,
          chatId,
          lastAccessAt: new Date(),
          lastTelegramAppAccess: new Date(),
        },
      });
    } else {
      // Создаём нового пользователя
      const apiKey = generateApiKey();
      appUser = await prisma.appUser.create({
        data: {
          telegramId,
          username,
          firstName,
          lastName,
          chatId,
          source: 'telegram',
          apiKey,
          lastAccessAt: new Date(),
          lastTelegramAppAccess: new Date(),
        },
      });
    }

    // Показываем приветствие с данными для входа
    await ctx.reply(
      `Добро пожаловать в prepodavAI 🎓\n\n` +
      `🔑 Ваши данные для входа в веб-версию:\n\n` +
      `👤 Username: ${appUser.username}\n` +
      `🔐 API Key: ${appUser.apiKey}\n\n` +
      `⚠️ Сохраните эти данные! Они понадобятся для входа в веб-версию.\n\n` +
      `🌐 Веб-версия: http://prepodavai.ru/\n\n` +
      `Я твой интеллектуальный помощник для:\n` +
      `— Создания учебных материалов\n` +
      `— Планирования уроков\n` +
      `— Проверки работ учеников\n` +
      `— Адаптации контента\n` +
      `— Методической поддержки\n\n` +
      `Открой Mini App для начала работы!`
    );

    // Сбрасываем кнопку меню, чтобы убрать Mini App
    try {
      if (ctx.chat) {
        await ctx.api.setChatMenuButton({
          chat_id: ctx.chat.id,
          menu_button: { type: 'default' },
        });
      }
    } catch (e) {
      console.error('Error resetting menu button:', e);
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

