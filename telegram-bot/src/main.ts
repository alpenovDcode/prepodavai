import { Bot, Context, InlineKeyboard } from 'grammy';
import * as dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import { TOOL_CONFIGS, ToolConfig, FieldConfig, getToolConfig } from './tool-configs';

dotenv.config();

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN || '');
const prisma = new PrismaClient();
const API_URL = process.env.API_URL || 'http://localhost:3001';

// ── Типы: регистрация ─────────────────────────────────────────────────────────
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

// ── Типы: генерация ───────────────────────────────────────────────────────────
interface GenerationSession {
  toolKey: string;
  fieldIndex: number;
  params: Record<string, string>;
  lastActivity: number;
}

// ── Константы: регистрация ────────────────────────────────────────────────────
const MAX_WRONG_ATTEMPTS = 3;
const SMS_RESEND_COOLDOWN_MS = 60_000;
const SMS_CODE_TTL_MS = 5 * 60_000;
const MAX_CONCURRENT_REG_SESSIONS = 500;

// ── Константы: генерация ──────────────────────────────────────────────────────
const GEN_SESSION_TTL_MS = 10 * 60_000;
const GEN_RATE_LIMIT_MS = 15_000;
const MAX_GEN_SESSIONS = 300;
const MAX_CALLBACK_DATA_LEN = 32;

// ── State ─────────────────────────────────────────────────────────────────────
const regStates = new Map<string, RegistrationState>();
const genSessions = new Map<string, GenerationSession>();
const lastGenAt = new Map<string, number>();

// ── Generation session helpers ────────────────────────────────────────────────
function createGenSession(telegramId: string, toolKey: string): GenerationSession {
  const now = Date.now();
  for (const [id, s] of genSessions) {
    if (now - s.lastActivity > GEN_SESSION_TTL_MS) genSessions.delete(id);
  }
  if (genSessions.size >= MAX_GEN_SESSIONS && !genSessions.has(telegramId)) {
    throw new Error('Сервис перегружен. Попробуйте позже.');
  }
  const session: GenerationSession = { toolKey, fieldIndex: 0, params: {}, lastActivity: now };
  genSessions.set(telegramId, session);
  return session;
}

function getGenSession(telegramId: string): GenerationSession | undefined {
  const s = genSessions.get(telegramId);
  if (!s) return undefined;
  if (Date.now() - s.lastActivity > GEN_SESSION_TTL_MS) {
    genSessions.delete(telegramId);
    return undefined;
  }
  s.lastActivity = Date.now();
  return s;
}

// ── Wizard helpers ────────────────────────────────────────────────────────────
function resolveOptions(field: FieldConfig, params: Record<string, string>) {
  if (field.conditionalOptions) return field.conditionalOptions(params);
  return field.options ?? null;
}

function resolveOptionByIndex(field: FieldConfig, index: number, params: Record<string, string>): string | null {
  const options = resolveOptions(field, params);
  if (!options || index < 0 || index >= options.length) return null;
  return options[index].value;
}

function buildToolSelectionKeyboard(): InlineKeyboard {
  const kb = new InlineKeyboard();
  TOOL_CONFIGS.forEach((tool, i) => {
    if (i > 0 && i % 2 === 0) kb.row();
    kb.text(`${tool.emoji} ${tool.label}`, `g:t:${tool.key}`);
  });
  return kb;
}

function buildFieldKeyboard(field: FieldConfig, session: GenerationSession): InlineKeyboard | null {
  if (field.type === 'file') {
    return new InlineKeyboard().text('❌ Отмена', 'g:no');
  }
  const options = resolveOptions(field, session.params);
  if (!options) {
    if (!field.required && field.skipLabel) {
      return new InlineKeyboard().text(`⏭️ ${field.skipLabel}`, 'g:skip');
    }
    return null;
  }
  const kb = new InlineKeyboard();
  const cols = options.length <= 3 ? options.length : 2;
  options.forEach((opt, i) => {
    if (i > 0 && i % cols === 0) kb.row();
    kb.text(opt.label, `g:v:${i}`);
  });
  if (!field.required && field.skipLabel) {
    kb.row().text(`⏭️ ${field.skipLabel}`, 'g:skip');
  }
  return kb;
}

function buildConfirmKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text('✅ Генерировать', 'g:ok').text('❌ Отмена', 'g:no');
}

function buildConfirmMessage(tool: ToolConfig, params: Record<string, string>): string {
  const lines: string[] = [`*${tool.emoji} ${tool.label}* — подтверждение\n`];
  for (const field of tool.fields) {
    const val = params[field.key];
    if (val !== undefined && val !== '') lines.push(`• ${val}`);
  }
  lines.push(`\n💳 Стоимость: *${tool.creditCost} токена*`);
  lines.push(`⏱ Примерное время: *${tool.estimatedTime}*`);
  lines.push('\nГенерировать?');
  return lines.join('\n');
}

function sanitize(raw: string): string {
  return raw.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
}

function validateText(raw: string, field: FieldConfig): string | null {
  const value = raw.trim();
  if (field.required && !value) return '❌ Это поле обязательно. Пожалуйста, введите текст.';
  if (value.length > field.maxLength) return `❌ Слишком длинный текст. Максимум — ${field.maxLength} символов.`;
  return null;
}

async function askField(ctx: Context, tool: ToolConfig, session: GenerationSession) {
  const field = tool.fields[session.fieldIndex];
  const kb = buildFieldKeyboard(field, session);
  if (kb) {
    await ctx.reply(field.label, { parse_mode: 'Markdown', reply_markup: kb });
  } else {
    await ctx.reply(field.label, { parse_mode: 'Markdown' });
  }
}

async function nextStep(ctx: Context, session: GenerationSession, tool: ToolConfig) {
  if (session.fieldIndex >= tool.fields.length) {
    const msg = buildConfirmMessage(tool, session.params);
    await ctx.reply(msg, { parse_mode: 'Markdown', reply_markup: buildConfirmKeyboard() });
  } else {
    await askField(ctx, tool, session);
  }
}

// ── Backend API helpers ───────────────────────────────────────────────────────

// Фикс 1: некоторые старые пользователи могут не иметь apiKey — генерируем и сохраняем
async function ensureApiKey(user: any): Promise<string> {
  if (user.apiKey) return user.apiKey;
  const newApiKey = crypto.randomBytes(16).toString('hex');
  await prisma.appUser.update({ where: { id: user.id }, data: { apiKey: newApiKey } as any });
  user.apiKey = newApiKey;
  console.log(`[API] Generated missing apiKey for user ${user.id}`);
  return newApiKey;
}

async function getApiToken(username: string, apiKey: string): Promise<string | null> {
  const maskedKey = apiKey ? `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}` : 'null';
  console.log(`[Auth] login attempt: username=${username} apiKey=${maskedKey}`);
  try {
    const resp = await fetch(`${API_URL}/api/auth/login-with-api-key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, apiKey }),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      console.error(`[Auth] login-with-api-key failed: status=${resp.status} body=${body.slice(0, 200)}`);
      return null;
    }
    const data = await resp.json() as any;
    return data.access_token ?? null;
  } catch (err) {
    console.error(`[Auth] login-with-api-key network error:`, err);
    return null;
  }
}

async function callGenerationApi(token: string, generationType: string, params: Record<string, string>): Promise<any> {
  const resp = await fetch(`${API_URL}/api/generations/${generationType}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ ...params, _miniAppPlatform: 'telegram' }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ message: `HTTP ${resp.status}` })) as any;
    throw new Error(err.message ?? `HTTP ${resp.status}`);
  }
  return resp.json();
}

async function callGamesApi(token: string, type: string, topic: string): Promise<any> {
  const resp = await fetch(`${API_URL}/api/games/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ type, topic }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ message: `HTTP ${resp.status}` })) as any;
    throw new Error(err.message ?? `HTTP ${resp.status}`);
  }
  return resp.json();
}

async function uploadFileToBackend(
  fileId: string,
  mimeType: string,
  originalName: string,
  token: string,
): Promise<{ hash: string; url: string }> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN || '';
  const fileInfo = await bot.api.getFile(fileId);
  const filePath = fileInfo.file_path;
  if (!filePath) throw new Error('Telegram не вернул путь к файлу');

  const downloadUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
  const fileResp = await fetch(downloadUrl);
  if (!fileResp.ok) throw new Error('Не удалось скачать файл из Telegram');
  const fileBuffer = Buffer.from(await fileResp.arrayBuffer());

  const formData = new FormData();
  const blob = new Blob([fileBuffer], { type: mimeType });
  formData.append('file', blob, originalName);

  const uploadResp = await fetch(`${API_URL}/api/files/upload`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: formData as any,
  });
  if (!uploadResp.ok) {
    const err = await uploadResp.json().catch(() => ({ message: 'Upload failed' })) as any;
    throw new Error(err.message ?? 'Upload failed');
  }
  return uploadResp.json() as Promise<{ hash: string; url: string }>;
}

function humanizeError(err: any): string {
  const msg: string = err?.message ?? '';
  if (msg.toLowerCase().includes('токен') || msg.toLowerCase().includes('кредит') || msg.toLowerCase().includes('баланс')) {
    return '💳 Недостаточно токенов. Пополните баланс на сайте prepodavai.ru';
  }
  if (msg.toLowerCase().includes('не найден')) {
    return '❌ Аккаунт не найден. Используйте /start.';
  }
  console.error('[Gen] Unhandled error:', msg);
  return '❌ Произошла ошибка при генерации. Попробуйте ещё раз или обратитесь в поддержку.';
}

// ── SMSC: отправка SMS ────────────────────────────────────────────────────────
async function sendSms(phone: string, message: string): Promise<boolean> {
  const login = process.env.SMSC_LOGIN;
  const password = process.env.SMSC_PASSWORD;
  const sender = process.env.SMSC_SENDER;

  if (!login || !password) {
    console.error('[SMS] SMSC credentials not configured');
    return false;
  }

  try {
    const params = new URLSearchParams({ login, psw: password, phones: phone, mes: message, fmt: '3', charset: 'utf-8' });
    if (sender) params.set('sender', sender);

    const resp = await fetch(`https://smsc.ru/sys/send.php?${params.toString()}`);
    const rawText = await resp.text();

    let data: any;
    try { data = JSON.parse(rawText); } catch {
      console.error(`[SMS] Non-JSON response: ${rawText}`);
      return false;
    }

    if (data?.id) return true;
    console.error(`[SMS] Failed: error_code=${data?.error_code}, error=${data?.error}`);
    return false;
  } catch (err) {
    console.error(`[SMS] Network error: ${err}`);
    return false;
  }
}

// ── Вспомогательные ───────────────────────────────────────────────────────────
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

// ── Регистрация: шаг 0 ────────────────────────────────────────────────────────
async function startRegistration(ctx: Context, telegramId: string) {
  if (regStates.size >= MAX_CONCURRENT_REG_SESSIONS) {
    await ctx.reply('⚠️ Сервис временно недоступен. Попробуйте позже.');
    return;
  }
  regStates.set(telegramId, { step: 'awaiting_email', wrongAttempts: 0 });
  await ctx.reply(
    `👋 Добро пожаловать в *PrepodavAI*!\n\nДавайте создадим ваш аккаунт — это займёт меньше минуты.\n\n*Шаг 1 из 3* — Введите вашу электронную почту:`,
    { parse_mode: 'Markdown' },
  );
}

// ── Регистрация: шаг 1 — email ────────────────────────────────────────────────
async function handleEmailInput(ctx: Context, telegramId: string, state: RegistrationState, text: string) {
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
    await ctx.reply('⚠️ Этот email уже зарегистрирован.\n\nЕсли это ваш аккаунт — войдите на сайте и привяжите Telegram в настройках профиля.');
    return;
  }

  state.email = email;
  state.step = 'awaiting_phone';
  regStates.set(telegramId, state);
  await ctx.reply(
    `✅ Email принят.\n\n*Шаг 2 из 3* — Введите номер телефона в международном формате:\n\nНапример: *+79991234567*\n\n_Отправим SMS с кодом подтверждения_`,
    { parse_mode: 'Markdown' },
  );
}

// ── Регистрация: шаг 2 — телефон + SMS ───────────────────────────────────────
async function handlePhoneInput(ctx: Context, telegramId: string, state: RegistrationState, text: string) {
  const phone = text.replace(/[\s\-\(\)]/g, '');
  const phoneRegex = /^\+[1-9]\d{7,14}$/;
  if (!phoneRegex.test(phone)) {
    await ctx.reply('❌ Некорректный формат номера.\n\nВведите номер с кодом страны, например: *+79991234567*', { parse_mode: 'Markdown' });
    return;
  }

  const exists = await prisma.appUser.findFirst({ where: { phone } });
  if (exists) {
    await ctx.reply('⚠️ Этот номер телефона уже зарегистрирован.\n\nЕсли это ваш аккаунт — войдите на сайте и привяжите Telegram в настройках профиля.');
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
    const sent = await sendSms(phone, `PrepodavAI: ваш код подтверждения ${codeRaw}. Никому не сообщайте этот код.`);

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
      `📱 SMS отправлено на *${maskedPhone}*\n\n*Шаг 3 из 3* — Введите 6-значный код из SMS:\n\n_Код действителен 5 минут. Для отмены — /cancel_`,
      { parse_mode: 'Markdown' },
    );
  } catch (err) {
    state.locked = false;
    console.error(`[RegBot] SMS send error for ${telegramId}:`, err);
    await ctx.reply('❌ Внутренняя ошибка. Попробуйте позже.');
  }
}

// ── Регистрация: шаг 3 — проверка кода ───────────────────────────────────────
async function handleSmsCodeInput(ctx: Context, telegramId: string, state: RegistrationState, text: string) {
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

// ── Регистрация: создание аккаунта ────────────────────────────────────────────
async function completeRegistration(ctx: Context, telegramId: string, state: RegistrationState) {
  const user = ctx.from!;

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
          username, userHash: username, email: state.email, phone: state.phone,
          phoneVerified: true, passwordHash, apiKey, telegramId, chatId,
          telegramChatId: chatId, firstName: user.first_name || '', lastName: user.last_name || '',
          source: 'telegram_bot', lastAccessAt: new Date(), lastTelegramAppAccess: new Date(),
        } as any,
      });

      const starterPlan = await tx.subscriptionPlan.findUnique({ where: { planKey: 'starter' } });
      if (starterPlan) {
        const now = new Date();
        const endDate = new Date(now);
        endDate.setMonth(endDate.getMonth() + 1);
        await tx.userSubscription.create({
          data: {
            userId: appUser.id, planId: starterPlan.id, status: 'active',
            creditsBalance: 100, extraCredits: 0, creditsUsed: 0,
            overageCreditsUsed: 0, startDate: now, endDate, autoRenew: true,
          },
        });
      }
      return appUser;
    });

    regStates.delete(telegramId);
    console.log(`[RegBot] New user registered: id=${newUser.id} username=${username}`);

    const webAppUrl = process.env.WEBAPP_URL || 'https://prepodavai.ru';
    await ctx.reply(
      `🎉 *Регистрация завершена!*\n\nВаши данные для входа на сайте:\n\n👤 Логин: \`${username}\`\n🔑 Пароль: \`${password}\`\n\n⚠️ *Сохраните пароль* — он больше не будет показан.\n\nНажмите кнопку ниже, чтобы открыть PrepodavAI:`,
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

// ── Привязка Telegram к web-аккаунту ─────────────────────────────────────────
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

  // Читаем текущие данные чтобы не перезаписывать уже заполненные поля
  const webUser = await prisma.appUser.findUnique({ where: { id: linkToken.userId } });
  if (!webUser) {
    await ctx.reply('❌ Аккаунт не найден. Попробуйте позже.');
    return;
  }

  // Фикс 3: try-catch вокруг транзакции
  try {
    await prisma.$transaction([
      prisma.appUser.update({
        where: { id: linkToken.userId },
        data: {
          telegramId: user.id.toString(),
          telegramChatId,
          chatId: telegramChatId,
          // Обновляем имя/фамилию только если ещё не заданы
          ...(webUser.firstName ? {} : { firstName: user.first_name || undefined }),
          ...(webUser.lastName ? {} : { lastName: user.last_name || undefined }),
        } as any,
      }),
      prisma.linkToken.update({
        where: { id: linkToken.id },
        data: { status: 'completed', linkedId: user.id.toString(), linkedName: platformName },
      }),
    ]);
  } catch (err) {
    console.error(`[LinkToken] Transaction failed for userId=${linkToken.userId}:`, err);
    await ctx.reply('❌ Не удалось привязать аккаунт. Попробуйте позже.');
    return;
  }

  // Очищаем незавершённую регистрацию если была активна
  regStates.delete(user.id.toString());

  await ctx.reply('✅ Telegram успешно привязан к вашему аккаунту PrepodavAI!\n\nТеперь вы будете получать результаты генерации прямо здесь.');
}

// ── Команда /start ────────────────────────────────────────────────────────────
bot.command('start', async (ctx: Context) => {
  const user = ctx.from;
  if (!user) return;
  const telegramId = user.id.toString();

  const payload = ctx.match as string | undefined;
  if (payload && payload.startsWith('link_')) {
    await handleLinkToken(ctx, user, payload.slice(5));
    return;
  }

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
      `Добро пожаловать в prepodavAI 🎓\n\nЯ твой интеллектуальный помощник для:\n— Создания учебных материалов\n— Планирования уроков\n— Проверки работ учеников\n— Адаптации контента\n— Методической поддержки\n\nНажмите кнопку ниже, чтобы начать работу!`,
      { reply_markup: { inline_keyboard: [[{ text: '🚀 Открыть PrepodavAI', web_app: { url: `${webAppUrl}/dashboard` } }]] } },
    );
    return;
  }

  await startRegistration(ctx, telegramId);
});

// ── Команда /generate ─────────────────────────────────────────────────────────
bot.command('generate', async (ctx: Context) => {
  const telegramId = ctx.from?.id.toString();
  if (!telegramId) return;

  const user = await prisma.appUser.findUnique({ where: { telegramId } });
  if (!user) {
    await ctx.reply('❌ Аккаунт не найден.\n\nЗарегистрируйтесь через /start и попробуйте снова.');
    return;
  }

  genSessions.delete(telegramId);
  await ctx.reply('🛠️ *Выберите инструмент:*', { parse_mode: 'Markdown', reply_markup: buildToolSelectionKeyboard() });
});

// ── Команда /cancel ───────────────────────────────────────────────────────────
bot.command('cancel', async (ctx: Context) => {
  const telegramId = ctx.from?.id.toString();
  if (!telegramId) return;

  if (regStates.has(telegramId)) {
    regStates.delete(telegramId);
    await ctx.reply('❌ Регистрация отменена. Чтобы начать заново, отправьте /start.');
  } else if (genSessions.has(telegramId)) {
    genSessions.delete(telegramId);
    await ctx.reply('❌ Генерация отменена.');
  } else {
    await ctx.reply('Нет активного процесса.');
  }
});

// ── Callback queries (нажатия кнопок генерации) ───────────────────────────────
bot.on('callback_query:data', async (ctx: Context) => {
  const data = ctx.callbackQuery?.data ?? '';
  const telegramId = ctx.from?.id.toString();
  if (!telegramId || !data.startsWith('g:')) return;

  await ctx.answerCallbackQuery().catch(() => null);

  if (data.length > MAX_CALLBACK_DATA_LEN) return;

  if (data.startsWith('g:t:')) {
    // Выбор инструмента
    const toolKey = data.slice(4);
    const tool = getToolConfig(toolKey);
    if (!tool) return;

    const user = await prisma.appUser.findUnique({ where: { telegramId } });
    if (!user) {
      await ctx.reply('❌ Аккаунт не найден. Используйте /start.');
      return;
    }

    let session: GenerationSession;
    try {
      session = createGenSession(telegramId, toolKey);
    } catch (e: any) {
      await ctx.reply(`⚠️ ${e.message}`);
      return;
    }
    await askField(ctx, tool, session);

  } else if (data.startsWith('g:v:')) {
    // Выбор варианта из select
    const idx = parseInt(data.slice(4), 10);
    if (!Number.isFinite(idx) || idx < 0 || idx > 50) return;

    const session = getGenSession(telegramId);
    if (!session) { await ctx.reply('⏰ Сессия истекла. Начните заново: /generate'); return; }

    const tool = getToolConfig(session.toolKey);
    if (!tool) return;

    const field = tool.fields[session.fieldIndex];
    if (!field) return;

    const value = resolveOptionByIndex(field, idx, session.params);
    if (value === null) { await ctx.reply('❌ Недопустимый выбор. Нажмите одну из кнопок выше.'); return; }

    session.params[field.key] = value;
    session.fieldIndex++;
    await nextStep(ctx, session, tool);

  } else if (data === 'g:skip') {
    const session = getGenSession(telegramId);
    if (!session) return;

    const tool = getToolConfig(session.toolKey);
    if (!tool) return;

    const field = tool.fields[session.fieldIndex];
    if (!field) return;

    if (field.required) { await ctx.reply('❌ Это поле обязательно — пропустить нельзя.'); return; }

    if (field.default !== undefined) session.params[field.key] = field.default;
    session.fieldIndex++;
    await nextStep(ctx, session, tool);

  } else if (data === 'g:ok') {
    // Подтверждение генерации
    const session = getGenSession(telegramId);
    if (!session) { await ctx.reply('⏰ Сессия истекла. Начните заново: /generate'); return; }

    const lastGen = lastGenAt.get(telegramId) ?? 0;
    const waitMs = GEN_RATE_LIMIT_MS - (Date.now() - lastGen);
    if (waitMs > 0) {
      await ctx.reply(`⏳ Подождите ещё ${Math.ceil(waitMs / 1000)} сек. перед следующей генерацией.`);
      return;
    }

    const tool = getToolConfig(session.toolKey);
    if (!tool) return;

    const user = await prisma.appUser.findUnique({ where: { telegramId } }) as any;
    if (!user) { await ctx.reply('❌ Аккаунт не найден.'); genSessions.delete(telegramId); return; }

    genSessions.delete(telegramId);
    lastGenAt.set(telegramId, Date.now());

    await ctx.reply(`⏳ Генерирую ${tool.emoji} *${tool.label}*...\n_${tool.estimatedTime}_`, { parse_mode: 'Markdown' });

    try {
      const token = await getApiToken(user.username, await ensureApiKey(user));
      if (!token) { await ctx.reply('❌ Ошибка авторизации. Попробуйте позже или обратитесь в поддержку.'); return; }

      if (tool.serviceType === 'games') {
        const result = await callGamesApi(token, session.params.type, session.params.topic);
        const kb = new InlineKeyboard().url('🎮 Открыть игру', result.url);
        await ctx.reply(`🎮 *Игра готова!*\n\nТема: _${session.params.topic}_\n\nНажмите кнопку, чтобы открыть:`, { parse_mode: 'Markdown', reply_markup: kb });
      } else {
        const result = await callGenerationApi(token, tool.generationType, session.params);
        if (result.status === 'completed') {
          await ctx.reply(`✅ Готово! Отправляю ${tool.emoji} *${tool.label}* в чат...\n\n💳 Осталось токенов: *${result.remainingCredits ?? '—'}*`, { parse_mode: 'Markdown' });
        } else {
          await ctx.reply(`✅ Задача принята! Результат придёт в этот чат, как только будет готов.\n\n💳 Осталось токенов: *${result.remainingCredits ?? '—'}*`, { parse_mode: 'Markdown' });
        }
      }
    } catch (err: any) {
      await ctx.reply(humanizeError(err));
    }

  } else if (data === 'g:no') {
    genSessions.delete(telegramId);
    await ctx.reply('❌ Генерация отменена.');
  }
});

// ── Текстовые сообщения ───────────────────────────────────────────────────────
bot.on('message:text', async (ctx: Context) => {
  const user = ctx.from;
  if (!user) return;
  const telegramId = user.id.toString();
  const text = (ctx.message as any)?.text?.trim() ?? '';

  // Генерация в приоритете — если есть активная сессия
  const genSession = getGenSession(telegramId);
  if (genSession) {
    const tool = getToolConfig(genSession.toolKey);
    if (!tool) return;

    const field = tool.fields[genSession.fieldIndex];
    if (!field) return;

    if (field.type === 'file') {
      await ctx.reply('📎 Нужно отправить файл, а не текст. Прикрепите файл или нажмите «Отмена».');
      return;
    }

    if (field.type !== 'text') return;

    const sanitized = sanitize(text);
    const error = validateText(sanitized, field);
    if (error) { await ctx.reply(error); return; }

    genSession.params[field.key] = sanitized;
    genSession.fieldIndex++;
    await nextStep(ctx, genSession, tool);
    return;
  }

  // Регистрация
  const regState = regStates.get(telegramId);
  if (!regState) return;

  switch (regState.step) {
    case 'awaiting_email': await handleEmailInput(ctx, telegramId, regState, text); break;
    case 'awaiting_phone': await handlePhoneInput(ctx, telegramId, regState, text); break;
    case 'awaiting_sms_code': await handleSmsCodeInput(ctx, telegramId, regState, text); break;
  }
});

// ── Файлы (фото / документ / аудио / видео) ──────────────────────────────────
async function handleFileMessage(ctx: Context, receivedAs: 'photo' | 'document') {
  const telegramId = ctx.from?.id.toString();
  if (!telegramId) return;

  const session = getGenSession(telegramId);
  if (!session) return;

  const tool = getToolConfig(session.toolKey);
  if (!tool) return;

  const field = tool.fields[session.fieldIndex];
  if (!field || field.type !== 'file') {
    await ctx.reply('⚠️ Сейчас файл не ожидается. Ответьте на текущий вопрос или нажмите «Отмена».');
    return;
  }

  const msg = ctx.message as any;
  if (field.accept === 'photo' && receivedAs !== 'photo') {
    await ctx.reply('❌ Нужна фотография (не документ). Отправьте фото через иконку 📷.');
    return;
  }

  const user = await prisma.appUser.findUnique({ where: { telegramId } }) as any;
  if (!user) { await ctx.reply('❌ Аккаунт не найден.'); genSessions.delete(telegramId); return; }

  let fileId: string;
  let mimeType: string;
  let originalName: string;
  let fileSizeBytes: number | undefined;

  if (receivedAs === 'photo') {
    const photos: any[] = msg.photo ?? [];
    if (!photos.length) return;
    const largest = photos[photos.length - 1];
    fileId = largest.file_id;
    mimeType = 'image/jpeg';
    originalName = 'photo.jpg';
    fileSizeBytes = largest.file_size;
  } else {
    const doc = msg.document ?? msg.audio ?? msg.voice ?? msg.video;
    if (!doc) return;
    fileId = doc.file_id;
    mimeType = doc.mime_type ?? 'application/octet-stream';
    originalName = doc.file_name ?? `file_${Date.now()}`;
    fileSizeBytes = doc.file_size;
  }

  const maxBytes = (field.maxSizeMb ?? 20) * 1024 * 1024;
  if (fileSizeBytes && fileSizeBytes > maxBytes) {
    await ctx.reply(`❌ Файл слишком большой (${Math.round(fileSizeBytes / 1024 / 1024)} МБ).\nМаксимальный размер — ${field.maxSizeMb ?? 20} МБ.`);
    return;
  }

  await ctx.reply('⏳ Загружаю файл...');

  try {
    const token = await getApiToken(user.username, await ensureApiKey(user));
    if (!token) { await ctx.reply('❌ Ошибка авторизации. Попробуйте позже.'); return; }

    const result = await uploadFileToBackend(fileId, mimeType, originalName, token);
    session.params[field.key] = field.storeAs === 'url' ? result.url : result.hash;
    session.fieldIndex++;
    await nextStep(ctx, session, tool);
  } catch (err: any) {
    console.error(`[Gen] File upload failed for ${telegramId}:`, err);
    await ctx.reply('❌ Не удалось загрузить файл. Попробуйте ещё раз или отправьте другой файл.');
  }
}

bot.on('message:photo', (ctx) => handleFileMessage(ctx, 'photo'));
bot.on('message:document', (ctx) => handleFileMessage(ctx, 'document'));
bot.on('message:audio', (ctx) => handleFileMessage(ctx, 'document'));
bot.on('message:voice', (ctx) => handleFileMessage(ctx, 'document'));
bot.on('message:video', (ctx) => handleFileMessage(ctx, 'document'));

// ── Запуск ────────────────────────────────────────────────────────────────────
bot.start();
console.log('🤖 Telegram bot started (registration + generation active)');

process.on('SIGTERM', async () => { bot.stop(); await prisma.$disconnect(); process.exit(0); });
process.on('SIGINT', async () => { bot.stop(); await prisma.$disconnect(); process.exit(0); });
