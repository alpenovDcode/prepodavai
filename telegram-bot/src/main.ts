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
    await ctx.reply('❌ Ошибка: не удалось получить данные пользователя');
    return;
  }

  try {
    const telegramId = user.id.toString();
    const username = user.username || undefined;
    const firstName = user.first_name || '';
    const lastName = user.last_name || '';
    const chatId = ctx.chat?.id.toString() || telegramId;

    // Ищем существующего пользователя
    let appUser = await prisma.appUser.findUnique({
      where: { telegramId },
    });

    let isNewUser = false;
    let apiKey: string;

    if (appUser) {
      // Пользователь уже существует
      // Если у него нет API ключа - генерируем
      if (!appUser.apiKey) {
        apiKey = generateApiKey();
        appUser = await prisma.appUser.update({
          where: { id: appUser.id },
          data: {
            apiKey,
            username: username || appUser.username,
            firstName: firstName || appUser.firstName,
            lastName: lastName || appUser.lastName,
            chatId,
            lastAccessAt: new Date(),
            lastTelegramAppAccess: new Date(),
          },
        });
      } else {
        apiKey = appUser.apiKey;
        // Обновляем последний доступ
        appUser = await prisma.appUser.update({
          where: { id: appUser.id },
          data: {
            chatId,
            lastAccessAt: new Date(),
            lastTelegramAppAccess: new Date(),
          },
        });
      }
    } else {
      // Создаем нового пользователя
      isNewUser = true;
      apiKey = generateApiKey();
      const userHash = username || `tg_${telegramId}`;

      appUser = await prisma.appUser.create({
        data: {
          userHash,
          source: 'telegram',
          telegramId,
          chatId,
          username: username || telegramId,
          apiKey,
          firstName,
          lastName,
          lastAccessAt: new Date(),
          lastTelegramAppAccess: new Date(),
        },
      });
    }

    // Формируем сообщение
    let message = `Добро пожаловать в prepodavAI 🎓\n\n`;

    if (isNewUser) {
      message += `✅ Вы успешно зарегистрированы!\n\n`;
    }

    message += `🔑 Ваши данные для входа в веб-версию:\n\n`;
    message += `👤 Username: ${appUser.username}\n`;
    message += `🔐 API Key: ${apiKey}\n\n`;
    message += `⚠️ Сохраните эти данные! Они понадобятся для входа в веб-версию.\n\n`;
    message += `🌐 Веб-версия: ${process.env.WEB_APP_URL || 'http://localhost:3000'}\n\n`;
    message += `Я твой интеллектуальный помощник для:\n`;
    message += `— Создания учебных материалов\n`;
    message += `— Планирования уроков\n`;
    message += `— Проверки работ учеников\n`;
    message += `— Адаптации контента\n`;
    message += `— Методической поддержки\n\n`;
    message += `Открой Mini App для начала работы!`;

    await ctx.reply(message);

    console.log(`✅ User ${isNewUser ? 'registered' : 'updated'}: ${telegramId} (${appUser.username})`);
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

