import { Bot, Context } from 'grammy';
import * as dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';

dotenv.config();

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN || '');
const prisma = new PrismaClient();

// ── Типы состояний диалога регистрации ──────────────────────────────────────
type RegStep = 'awaiting_email' | 'awaiting_phone' | 'awaiting_sms_code';

interface RegistrationState {
  step: RegStep;
  email?: string;
  phone?: string;
  smsCodeHash?: string;
  smsCodeExpiresAt?: number;
  wrongAttempts?: number;
  smsSentAt?: number;
  locked?: boolean;
}

// ── Константы безопасности ────────────────────────────────────────────────
const MAX_WRONG_ATTEMPTS = 3;
const SMS_RESEND_COOLDOWN_MS = 60_000;
const SMS_CODE_TTL_MS = 5 * 60_000;
const MAX_CONCURRENT_SESSIONS = 500;

const regStates = new Map<string, RegistrationState>();

// ── SMSC: отправка SMS ────────────────────────────────────────────────────
async function sendSms(phone: string, message: string): Promise<boolean> {
  const login = process.env.SMSC_LOGIN;
  const password = process.env.SMSC_PASSWORD;
  const sender = process.env.SMSC_SENDER;

  if (!login || !password) {
    console.error('[SMS] SMSC credentials not configured (SMSC_LOGIN or SMSC_PASSWORD missing)');
    return false;
  }

  try {
    const params = new URLSearchParams({
      login,
      psw: password,
      phones: phone,
      mes: message,
      fmt: '3',
      charset: 'utf-8',
    });
    if (sender) params.set('sender', sender);

    const url = `https://smsc.ru/sys/send.php?${params.toString()}`;
    console.log(`[SMS] Sending to ${phone}, login=${login}, sender=${sender || 'none'}`);

    const resp = await fetch(url);
    const rawText = await resp.text();
    console.log(`[SMS] Raw response: ${rawText}`);

    let data: any;
    try {
      data = JSON.parse(rawText);
    } catch {
      console.error(`[SMS] Non-JSON response: ${rawText}`);
      return false;
    }

    if (data?.id) {
      console.log(`[SMS] Sent successfully to ${phone}, id=${data.id}`);
      return true;
    }

    console.error(`[SMS] Failed for ${phone}: error_code=${data?.error_code}, error=${data?.error}`);
    return false;
  } catch (err) {
    console.error(`[SMS] Network error: ${err}`);
    return false;
  }
}

// ── Вспомогательные функции ───────────────────────────────────────────────
async function ensureUniqueUsername(base: string): Promise<string> {
  const trimmed = (base.slice(0, 20) || 'user').replace(/[^a-z0-9_]/gi, '');
  const safe = trimmed || 'user';
  const exists = await prisma.appUser.findFirst({ where: { username: safe } });
  if (!exists) return safe;

  const suffix = crypto.randomInt(1000, 9999).toString();
  const candidate = `${safe}_${suffix}`.slice(0, 25);
  const exists2 = await prisma.appUser.findFirst({ where: { username: candidate } });
  return exists2 ? `${safe}_${crypto.randomInt(10_000, 99_999)}` : candidate;
}

// ── Шаг 0: начало регистрации ─────────────────────────────────────────────
async function startRegistration(ctx: Context, telegramId: string) {
  if (regStates.size >= MAX_CONCURRENT_SESSIONS) {
    await ctx.reply('⚠️ Сервис временно недоступен. Попробуйте позже.');
    return;
  }

  regStates.set(telegramId, { step: 'awaiting_email', wrongAttempts: 0 });

  await ctx.reply(
    `👋 Добро пожаловать в *PrepodavAI*!\n\n` +
    `Давайте создадим ваш аккаунт — это займёт меньше минуты.\n\n` +
    `*Шаг 1 из 3* — Введите вашу электронную почту:`,
    { parse_mode: 'Markdown' },
  );
}

// ── Шаг 1: email ──────────────────────────────────────────────────────────
async function handleEmailInput(
  ctx: Context,
  telegramId: string,
  state: RegistrationState,
  text: string,
) {
  const emailRegex = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(text) || text.length > 254) {
    await ctx.reply(
      '❌ Некорректный формат email.\n\nВведите действительный адрес, например: *ivan@example.com*',
      { parse_mode: 'Markdown' },
    );
    return;
  }

  const email = text.toLowerCase();
  const exists = await prisma.appUser.findFirst({ where: { email } });
  if (exists) {
    await ctx.reply(
      '⚠️ Этот email уже зарегистрирован.\n\nЕсли это ваш аккаунт — войдите на сайте и привяжите Telegram в настройках профиля.',
    );
    return;
  }

  state.email = email;
  state.step = 'awaiting_phone';
  regStates.set(telegramId, state);

  await ctx.reply(
    `✅ Email принят.\n\n` +
    `*Шаг 2 из 3* — Введите номер телефона в международном формате:\n\n` +
    `Например: *+79991234567*\n\n` +
    `_Отправим SMS с кодом подтверждения_`,
    { parse_mode: 'Markdown' },
  );
}

// ── Шаг 2: телефон + отправка SMS ─────────────────────────────────────────
async function handlePhoneInput(
  ctx: Context,
  telegramId: string,
  state: RegistrationState,
  text: string,
) {
  const phone = text.replace(/[\s\-\(\)]/g, '');
  const phoneRegex = /^\+[1-9]\d{7,14}$/;
  if (!phoneRegex.test(phone)) {
    await ctx.reply(
      '❌ Некорректный формат номера.\n\nВведите номер с кодом страны, например: *+79991234567*',
      { parse_mode: 'Markdown' },
    );
    return;
  }

  const exists = await prisma.appUser.findFirst({ where: { phone } });
  if (exists) {
    await ctx.reply(
      '⚠️ Этот номер телефона уже зарегистрирован.\n\nЕсли это ваш аккаунт — войдите на сайте и привяжите Telegram в настройках профиля.',
    );
    return;
  }

  const now = Date.now();
  if (state.smsSentAt && now - state.smsSentAt < SMS_RESEND_COOLDOWN_MS) {
    const secondsLeft = Math.ceil((SMS_RESEND_COOLDOWN_MS - (now - state.smsSentAt)) / 1000);
    await ctx.reply(`⏳ Подождите ${secondsLeft} секунд перед повторной отправкой SMS.`);
    return;
  }

  if (state.locked) return;
  state.locked = true;

  try {
    const codeRaw = crypto.randomInt(100_000, 999_999).toString();
    const codeHash = await bcrypt.hash(codeRaw, 10);

    const sent = await sendSms(
      phone,
      `PrepodavAI: ваш код подтверждения ${codeRaw}. Никому не сообщайте этот код.`,
    );

    if (!sent) {
      await ctx.reply('❌ Не удалось отправить SMS. Проверьте номер и попробуйте снова.');
      state.locked = false;
      return;
    }

    state.phone = phone;
    state.step = 'awaiting_sms_code';
    state.smsCodeHash = codeHash;
    state.smsCodeExpiresAt = now + SMS_CODE_TTL_MS;
    state.smsSentAt = now;
    state.wrongAttempts = 0;
    state.locked = false;
    regStates.set(telegramId, state);

    const maskedPhone = phone.slice(0, -4).replace(/\d/g, '•') + phone.slice(-4);
    await ctx.reply(
      `📱 SMS отправлено на *${maskedPhone}*\n\n` +
      `*Шаг 3 из 3* — Введите 6-значный код из SMS:\n\n` +
      `_Код действителен 5 минут. Для отмены — /cancel_`,
      { parse_mode: 'Markdown' },
    );
  } catch (err) {
    state.locked = false;
    console.error(`[RegBot] SMS send error for ${telegramId}:`, err);
    await ctx.reply('❌ Внутренняя ошибка. Попробуйте позже.');
  }
}

// ── Шаг 3: проверка SMS-кода ──────────────────────────────────────────────
async function handleSmsCodeInput(
  ctx: Context,
  telegramId: string,
  state: RegistrationState,
  text: string,
) {
  if (!/^\d{4,6}$/.test(text)) {
    await ctx.reply('❌ Код должен состоять из 6 цифр. Попробуйте ещё раз.');
    return;
  }

  if (!state.smsCodeExpiresAt || Date.now() > state.smsCodeExpiresAt) {
    regStates.delete(telegramId);
    await ctx.reply('⏰ Срок действия кода истёк.\n\nНачните регистрацию заново: /start');
    return;
  }

  if (state.locked) return;
  state.locked = true;

  try {
    const isValid = await bcrypt.compare(text, state.smsCodeHash!);

    if (!isValid) {
      state.wrongAttempts = (state.wrongAttempts ?? 0) + 1;
      state.locked = false;
      regStates.set(telegramId, state);

      const attemptsLeft = MAX_WRONG_ATTEMPTS - state.wrongAttempts;
      if (attemptsLeft <= 0) {
        regStates.delete(telegramId);
        await ctx.reply('🚫 Слишком много неверных попыток.\n\nРегистрация отменена. Начните заново: /start');
      } else {
        await ctx.reply(`❌ Неверный код. Осталось попыток: *${attemptsLeft}*`, { parse_mode: 'Markdown' });
      }
      return;
    }

    await completeRegistration(ctx, telegramId, state);
  } catch (err) {
    state.locked = false;
    console.error(`[RegBot] Code verify error for ${telegramId}:`, err);
    await ctx.reply('❌ Внутренняя ошибка. Попробуйте позже.');
  }
}

// ── Финал: создание аккаунта ──────────────────────────────────────────────
async function completeRegistration(
  ctx: Context,
  telegramId: string,
  state: RegistrationState,
) {
  const user = ctx.from!;

  // Финальная проверка на race conditions
  const [emailTaken, phoneTaken, tgTaken] = await Promise.all([
    prisma.appUser.findFirst({ where: { email: state.email } }),
    prisma.appUser.findFirst({ where: { phone: state.phone } }),
    prisma.appUser.findUnique({ where: { telegramId } }),
  ]);

  if (emailTaken || phoneTaken || tgTaken) {
    regStates.delete(telegramId);
    await ctx.reply('⚠️ Аккаунт с такими данными уже существует.\n\nЕсли это ваш аккаунт — войдите на сайте.');
    return;
  }

  const password = crypto.randomBytes(9).toString('base64').slice(0, 12).replace(/[^a-zA-Z0-9]/g, 'x');
  const passwordHash = await bcrypt.hash(password, 12);

  const baseUsername = user.username
    ? user.username.toLowerCase().replace(/[^a-z0-9_]/g, '')
    : `user${telegramId}`;
  const username = await ensureUniqueUsername(baseUsername);

  const apiKey = crypto.randomBytes(16).toString('hex');
  const chatId = ctx.chat!.id.toString();

  try {
    const newUser = await prisma.$transaction(async (tx) => {
      const appUser = await tx.appUser.create({
        data: {
          username,
          userHash: username,
          email: state.email,
          phone: state.phone,
          phoneVerified: true,
          passwordHash,
          apiKey,
          telegramId,
          chatId,
          telegramChatId: chatId,
          firstName: user.first_name || '',
          lastName: user.last_name || '',
          source: 'telegram_bot',
          lastAccessAt: new Date(),
          lastTelegramAppAccess: new Date(),
        } as any,
      });

      const starterPlan = await tx.subscriptionPlan.findUnique({
        where: { planKey: 'starter' },
      });

      if (starterPlan) {
        const now = new Date();
        const endDate = new Date(now);
        endDate.setMonth(endDate.getMonth() + 1);

        await tx.userSubscription.create({
          data: {
            userId: appUser.id,
            planId: starterPlan.id,
            status: 'active',
            creditsBalance: 100,
            extraCredits: 0,
            creditsUsed: 0,
            overageCreditsUsed: 0,
            startDate: now,
            endDate,
            autoRenew: true,
          },
        });
      }

      return appUser;
    });

    regStates.delete(telegramId);
    console.log(`[RegBot] New user registered: id=${newUser.id} username=${username}`);

    const webAppUrl = process.env.WEBAPP_URL || 'https://prepodavai.ru';

    await ctx.reply(
      `🎉 *Регистрация завершена!*\n\n` +
      `Ваши данные для входа на сайте:\n\n` +
      `👤 Логин: \`${username}\`\n` +
      `🔑 Пароль: \`${password}\`\n\n` +
      `⚠️ *Сохраните пароль* — он больше не будет показан.\n\n` +
      `Нажмите кнопку ниже, чтобы открыть PrepodavAI:`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🚀 Открыть PrepodavAI', web_app: { url: `${webAppUrl}/dashboard` } }],
            [{ text: '🌐 Войти на сайте', url: `${webAppUrl}/auth` }],
          ],
        },
      },
    );
  } catch (err) {
    console.error(`[RegBot] Create user error for ${telegramId}:`, err);
    await ctx.reply('❌ Не удалось создать аккаунт. Попробуйте позже или обратитесь в поддержку.');
  }
}

// ── Обработчики команд ────────────────────────────────────────────────────
bot.command('start', async (ctx: Context) => {
  const user = ctx.from;
  if (!user) return;

  const telegramId = user.id.toString();

  // link_XXXXXXXX payload — привязка существующего web-аккаунта
  const payload = ctx.match as string | undefined;
  if (payload && payload.startsWith('link_')) {
    await handleLinkToken(ctx, user, payload.slice(5));
    return;
  }

  // Уже зарегистрирован — приветствие
  const existingUser = await prisma.appUser.findUnique({ where: { telegramId } });
  if (existingUser) {
    await prisma.appUser.update({
      where: { id: existingUser.id },
      data: {
        lastAccessAt: new Date(),
        chatId: ctx.chat!.id.toString(),
        telegramChatId: ctx.chat!.id.toString(),
        firstName: user.first_name || existingUser.firstName,
        lastName: user.last_name || existingUser.lastName,
        username: user.username || existingUser.username,
      } as any,
    });
    regStates.delete(telegramId);

    const webAppUrl = process.env.WEBAPP_URL || 'https://prepodavai.ru';
    await ctx.reply(
      `Добро пожаловать в prepodavAI 🎓\n\n` +
      `Я твой интеллектуальный помощник для:\n` +
      `— Создания учебных материалов\n` +
      `— Планирования уроков\n` +
      `— Проверки работ учеников\n` +
      `— Адаптации контента\n` +
      `— Методической поддержки\n\n` +
      `Нажмите кнопку ниже, чтобы начать работу!`,
      {
        reply_markup: {
          inline_keyboard: [[
            { text: '🚀 Открыть PrepodavAI', web_app: { url: `${webAppUrl}/dashboard` } },
          ]],
        },
      },
    );
    return;
  }

  // Новый пользователь — начинаем регистрацию
  await startRegistration(ctx, telegramId);
});

bot.command('cancel', async (ctx: Context) => {
  const telegramId = ctx.from?.id.toString();
  if (!telegramId) return;
  if (regStates.has(telegramId)) {
    regStates.delete(telegramId);
    await ctx.reply('❌ Регистрация отменена. Чтобы начать заново, отправьте /start.');
  } else {
    await ctx.reply('Нет активного процесса регистрации.');
  }
});

bot.on('message:text', async (ctx: Context) => {
  const user = ctx.from;
  if (!user) return;
  const telegramId = user.id.toString();
  const state = regStates.get(telegramId);

  if (!state) return;

  const text = (ctx.message as any)?.text?.trim() ?? '';

  switch (state.step) {
    case 'awaiting_email':
      await handleEmailInput(ctx, telegramId, state, text);
      break;
    case 'awaiting_phone':
      await handlePhoneInput(ctx, telegramId, state, text);
      break;
    case 'awaiting_sms_code':
      await handleSmsCodeInput(ctx, telegramId, state, text);
      break;
  }
});

// ── Привязка Telegram к существующему web-аккаунту ────────────────────────
async function handleLinkToken(ctx: Context, user: any, token: string) {
  const linkToken = await prisma.linkToken.findUnique({ where: { token } });

  if (!linkToken || linkToken.platform !== 'telegram') {
    await ctx.reply('❌ Токен привязки не найден. Попробуйте сгенерировать новый в настройках профиля.');
    return;
  }

  if (linkToken.status !== 'pending') {
    await ctx.reply('⚠️ Этот токен уже использован или истёк. Сгенерируйте новый в настройках профиля.');
    return;
  }

  if (new Date() > linkToken.expiresAt) {
    await prisma.linkToken.update({ where: { id: linkToken.id }, data: { status: 'expired' } });
    await ctx.reply('⏰ Токен истёк. Пожалуйста, сгенерируйте новый в настройках профиля.');
    return;
  }

  const alreadyLinked = await prisma.appUser.findUnique({ where: { telegramId: user.id.toString() } });
  if (alreadyLinked && alreadyLinked.id !== linkToken.userId) {
    await ctx.reply('⚠️ Этот аккаунт Telegram уже привязан к другому профилю PrepodavAI.');
    return;
  }

  const telegramChatId = ctx.chat!.id.toString();
  const platformName = user.username ? `@${user.username}` : user.first_name || `id${user.id}`;

  await prisma.$transaction([
    prisma.appUser.update({
      where: { id: linkToken.userId },
      data: {
        telegramId: user.id.toString(),
        telegramChatId,
        chatId: telegramChatId,
        username: user.username || undefined,
        firstName: user.first_name || undefined,
        lastName: user.last_name || undefined,
      } as any,
    }),
    prisma.linkToken.update({
      where: { id: linkToken.id },
      data: { status: 'completed', linkedId: user.id.toString(), linkedName: platformName },
    }),
  ]);

  await ctx.reply('✅ Telegram успешно привязан к вашему аккаунту PrepodavAI!\n\nТеперь вы будете получать результаты генерации прямо здесь.');
}

// ── Запуск ────────────────────────────────────────────────────────────────
bot.start();
console.log('🤖 Telegram bot started (registration flow active)');

process.on('SIGTERM', async () => {
  bot.stop();
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  bot.stop();
  await prisma.$disconnect();
  process.exit(0);
});
