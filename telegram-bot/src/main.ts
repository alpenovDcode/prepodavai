import { Bot, Context, InlineKeyboard, BotConfig } from 'grammy';
import * as dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import { Agent, setGlobalDispatcher } from 'undici';
import { TOOL_CONFIGS, ToolConfig, FieldConfig, getToolConfig } from './tool-configs';

dotenv.config();

// ── Форс IPv4 для всего исходящего fetch (grammY ходит через глобальный fetch/undici).
// У api.telegram.org есть и A, и AAAA. В docker-bridge IPv6 нет, поэтому Node пытается
// IPv6-коннект и виснет до таймаута ("Network request for 'getMe' failed"). Литеральный
// IPv4 (1.1.1.1) при этом работал — там AAAA не запрашивается. Форсируем семейство v4.
// Отключается через DISABLE_FORCE_IPV4=1 на случай, если где-то нужен IPv6.
if (process.env.DISABLE_FORCE_IPV4 !== '1') {
  try {
    setGlobalDispatcher(new Agent({ connect: { family: 4 } as any }));
    console.log('[Bot] Global dispatcher: forcing IPv4 (connect.family=4)');
  } catch (e) {
    console.error('[Bot] Failed to set IPv4 dispatcher:', e);
  }
}

const prisma = new PrismaClient();
const API_URL = process.env.API_URL || 'http://localhost:3001';

/**
 * Собирает client-конфиг grammY с учётом окружения:
 *  - TELEGRAM_API_ROOT — кастомный Bot API endpoint (зеркало / локальный bot-api-server),
 *    обход блокировки api.telegram.org.
 *  - TELEGRAM_PROXY / HTTPS_PROXY / ALL_PROXY — HTTP(S)-прокси для egress через undici-dispatcher
 *    (undici поставляется вместе с Node 18+, отдельная зависимость не нужна).
 * Если ничего не задано — поведение прежнее (прямой доступ).
 */
function buildBotClientConfig(): BotConfig<Context>['client'] {
  const client: NonNullable<BotConfig<Context>['client']> = {};

  const apiRoot = process.env.TELEGRAM_API_ROOT?.trim();
  if (apiRoot) {
    client.apiRoot = apiRoot;
    console.log(`[Bot] Using custom Bot API root: ${apiRoot}`);
  }

  const proxyUrl = (
    process.env.TELEGRAM_PROXY ||
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.ALL_PROXY ||
    ''
  ).trim();
  if (proxyUrl) {
    try {
      // Ленивая загрузка undici: модуль есть в Node 18+, но не как глобал.
      const { ProxyAgent } = require('undici');

      // Логин/пароль вытаскиваем из URL и передаём как явный Basic-токен:
      // undici в ряде версий НЕ подхватывает userinfo из строки прокси,
      // и аутентификация молча не отправляется → 407/таймаут.
      const u = new URL(proxyUrl);
      const agentOpts: any = { uri: `${u.protocol}//${u.host}` };
      if (u.username || u.password) {
        const creds = `${decodeURIComponent(u.username)}:${decodeURIComponent(u.password)}`;
        agentOpts.token = `Basic ${Buffer.from(creds).toString('base64')}`;
      }
      const dispatcher = new ProxyAgent(agentOpts);
      client.baseFetchConfig = { dispatcher } as any;
      console.log(`[Bot] Routing Telegram egress through proxy: ${u.protocol}//${u.host} (auth: ${u.username ? 'yes' : 'no'})`);
    } catch (e) {
      console.error(
        `[Bot] Failed to init proxy agent for "${proxyUrl}". Установи зависимость 'undici' или проверь URL:`,
        e,
      );
    }
  }

  return Object.keys(client).length ? client : undefined;
}

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN || '', {
  client: buildBotClientConfig(),
});

// ── Типы: регистрация ─────────────────────────────────────────────────────────
type RegStep = 'awaiting_email';

interface RegistrationState {
  step: RegStep;
  email?: string;
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
const MAX_CONCURRENT_REG_SESSIONS = 500;
const MINI_APP_BTN = '📱 Открыть Преподавай';

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

function buildMultiselectKeyboard(field: FieldConfig, session: GenerationSession): InlineKeyboard {
  const selected = new Set((session.params[field.key] || '').split(',').filter(Boolean));
  const options = field.options ?? [];
  const kb = new InlineKeyboard();
  options.forEach((opt, i) => {
    if (i > 0 && i % 2 === 0) kb.row();
    const isSelected = selected.has(opt.value);
    kb.text(`${isSelected ? '✅' : '☐'} ${opt.label}`, `g:ms:${i}`);
  });
  kb.row().text(selected.size > 0 ? `✅ Готово (${selected.size})` : '✅ Готово', 'g:msok');
  kb.row().text('❌ Отмена', 'g:no');
  return kb;
}

function buildFieldKeyboard(field: FieldConfig, session: GenerationSession): InlineKeyboard | null {
  if (field.type === 'multiselect') {
    return buildMultiselectKeyboard(field, session);
  }
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
    return data.token ?? null;
  } catch (err) {
    console.error(`[Auth] login-with-api-key network error:`, err);
    return null;
  }
}

async function callGenerationApi(token: string, generationType: string, params: Record<string, any>): Promise<any> {
  const resp = await fetch(`${API_URL}/api/generate/${generationType}`, {
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

  const uploadAbort = AbortSignal.timeout(30_000);
  const uploadResp = await fetch(`${API_URL}/api/files/upload`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: formData as any,
    signal: uploadAbort,
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

// ── Email: welcome письмо через backend API ───────────────────────────────────
async function sendWelcomeEmailViaApi(username: string, password: string, email: string): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN || '';
  try {
    const resp = await fetch(`${API_URL}/api/webhook/telegram/internal/send-welcome-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-bot-secret': botToken },
      body: JSON.stringify({ username, password, email }),
    });
    if (!resp.ok) {
      const err = await resp.text().catch(() => '');
      console.error(`[Email] Backend email API error: status=${resp.status} body=${err.slice(0, 200)}`);
    }
  } catch (err) {
    console.error(`[Email] Network error sending welcome email:`, err);
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

// ── Регистрация ────────────────────────────────────────────────────────────────
async function startRegistration(ctx: Context, telegramId: string) {
  if (regStates.size >= MAX_CONCURRENT_REG_SESSIONS) {
    await ctx.reply('⚠️ Сервис временно недоступен. Попробуйте позже.');
    return;
  }
  regStates.set(telegramId, { step: 'awaiting_email' });
  await ctx.reply(
    `👋 Добро пожаловать в Преподавай 🎓\n\nДавайте создадим ваш аккаунт — это займёт меньше минуты.\n\nВведите вашу электронную почту:`,
    { parse_mode: 'Markdown' },
  );
}

// ── Регистрация: email ────────────────────────────────────────────────────────
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

  if (state.locked) return;
  state.locked = true;

  state.email = email;
  regStates.set(telegramId, state);

  try {
    await completeRegistration(ctx, telegramId, state);
  } catch (err) {
    state.locked = false;
    console.error(`[RegBot] Registration error for ${telegramId}:`, err);
    await ctx.reply('❌ Внутренняя ошибка. Попробуйте позже.');
  }
}

// ── Регистрация: создание аккаунта ────────────────────────────────────────────
async function completeRegistration(ctx: Context, telegramId: string, state: RegistrationState) {
  const user = ctx.from!;

  const emailTaken = await prisma.appUser.findFirst({ where: { email: state.email } });
  if (emailTaken) {
    regStates.delete(telegramId);
    await ctx.reply('⚠️ Аккаунт с таким email уже существует.\n\nЕсли это ваш аккаунт — войдите на сайте.');
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
      // Move telegramId from shadow to web AppUser so mini-app auto-login works via validate-init-data
      await tx.appUser.updateMany({ where: { telegramId: user.id.toString() }, data: { telegramId: null, telegramChatId: null } as any });

      const appUser = await tx.appUser.create({
        data: {
          username, userHash: username, email: state.email,
          passwordHash, apiKey, chatId,
          telegramId: user.id.toString(), telegramChatId: chatId,
          firstName: user.first_name || '', lastName: user.last_name || '',
          source: 'telegram_bot', lastAccessAt: new Date(), lastTelegramAppAccess: new Date(),
        } as any,
      });

      // New web users get business plan with 1500 credits
      const businessPlan = await tx.subscriptionPlan.findUnique({ where: { planKey: 'business' } });
      if (businessPlan) {
        const now = new Date();
        const endDate = new Date(now);
        endDate.setMonth(endDate.getMonth() + 1);
        await tx.userSubscription.create({
          data: {
            userId: appUser.id, planId: businessPlan.id, status: 'active',
            creditsBalance: 1500, extraCredits: 0, creditsUsed: 0,
            overageCreditsUsed: 0, startDate: now, endDate, autoRenew: true,
          },
        });
      }

      await (tx as any).botUser.upsert({
        where: { telegramId },
        update: { appUserId: appUser.id, email: state.email, registrationStatus: 'registered' },
        create: {
          telegramId, appUserId: appUser.id,
          firstName: user.first_name || null, lastName: user.last_name || null,
          username: user.username || null, email: state.email,
          registrationStatus: 'registered', source: 'telegram_bot',
          lastActiveAt: new Date(),
        },
      });

      return appUser;
    });

    regStates.delete(telegramId);
    console.log(`[RegBot] New user registered: id=${newUser.id} username=${username}`);

    // Отправляем email (fire-and-forget)
    sendWelcomeEmailViaApi(username, password, state.email!).catch((err) => {
      console.error(`[RegBot] Failed to send welcome email:`, err);
    });

    const webAppUrl = process.env.WEBAPP_URL || 'https://prepodavai.ru';

    await ctx.reply(
      `🎉 *Спасибо за регистрацию!*\n\n` +
      `Данные для входа отправлены на *${state.email}*\n\n` +
      `Ваши данные для входа на сайте:\n\n` +
      `👤 Логин: \`${username}\`\n` +
      `🔑 Пароль: \`${password}\`\n\n` +
      `💳 Токенов на платформе: *1500*\n\n` +
      `⚠️ *Сохраните пароль* — он больше не будет показан.`,
      { parse_mode: 'Markdown' },
    );

    await ctx.reply(
      `Нажмите кнопку, чтобы открыть Преподавай:`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🚀 Открыть Преподавай', web_app: { url: `${webAppUrl}/dashboard` } }],
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
  const isShadowAccount = (alreadyLinked as any)?.source === 'telegram_bot';
  if (alreadyLinked && alreadyLinked.id !== linkToken.userId && !isShadowAccount) {
    await ctx.reply('⚠️ Этот аккаунт Telegram уже привязан к другому профилю Преподавай.');
    return;
  }
  if (isShadowAccount && alreadyLinked) {
    await prisma.appUser.update({ where: { id: alreadyLinked.id }, data: { telegramId: null, telegramChatId: null } as any });
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

  // Create/update BotUser for this Telegram account
  await (prisma as any).botUser.upsert({
    where: { telegramId: user.id.toString() },
    update: { appUserId: linkToken.userId, lastActiveAt: new Date(), registrationStatus: 'linked' },
    create: {
      telegramId: user.id.toString(),
      appUserId: linkToken.userId,
      firstName: user.first_name || null,
      lastName: user.last_name || null,
      username: user.username || null,
      email: webUser.email || null,
      registrationStatus: 'linked',
      source: 'linked_telegram',
      lastActiveAt: new Date(),
    } as any,
  });

  await ctx.reply('✅ Telegram успешно привязан к вашему аккаунту Преподавай!\n\nТеперь вы будете получать результаты генерации прямо здесь.');
}

// ── Команда /start ────────────────────────────────────────────────────────────
bot.command('start', async (ctx: Context) => {
  const user = ctx.from;
  if (!user) return;
  const telegramId = user.id.toString();
  console.log(`[Bot] /start from ${telegramId} (@${user.username ?? 'no_username'})`);

  const payload = ctx.match as string | undefined;
  if (payload && payload.startsWith('link_')) {
    await handleLinkToken(ctx, user, payload.slice(5));
    return;
  }

  const existingUser = await prisma.appUser.findUnique({
    where: { telegramId },
  });
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
    genSessions.delete(telegramId);

    // Найти или создать BotUser
    const botUser = await (prisma as any).botUser.upsert({
      where: { telegramId },
      update: { lastActiveAt: new Date() },
      create: {
        telegramId,
        appUserId: existingUser.id,
        firstName: user.first_name || null,
        lastName: user.last_name || null,
        username: user.username || null,
        email: existingUser.email || null,
        registrationStatus: 'linked',
        source: 'linked_telegram',
        lastActiveAt: new Date(),
      } as any,
    });

    const balanceLine = `\n\n💳 Токенов на балансе: ${(botUser as any).botCredits}`;
    await ctx.reply(
      `Добро пожаловать в Преподавай 🎓\n\nЯ Ваш интеллектуальный помощник для:\n— Создания учебных материалов\n— Планирования уроков\n— Создания красочных презентаций\n— Методической поддержки\n— Создания интерактивных игр${balanceLine}`,
      { reply_markup: { keyboard: [[{ text: MINI_APP_BTN }]], resize_keyboard: true } },
    );
    await ctx.reply(
      `📌 *Как пользоваться:*\n\n1. Выберите инструмент из списка ниже\n2. Ответьте на несколько вопросов\n3. Получите готовый материал в PDF\n\nКаждая генерация стоит 3 токена.`,
      { parse_mode: 'Markdown' },
    );
    await ctx.reply('🛠️ *Выберите инструмент:*', { parse_mode: 'Markdown', reply_markup: buildToolSelectionKeyboard() });
    return;
  }

  const newBotUser = await (prisma as any).botUser.upsert({
    where: { telegramId },
    update: { lastActiveAt: new Date(), firstName: user.first_name || undefined, lastName: user.last_name || undefined, username: user.username || undefined },
    create: {
      telegramId,
      firstName: user.first_name || null,
      lastName: user.last_name || null,
      username: user.username || null,
      registrationStatus: 'pending',
      source: 'telegram_bot',
      lastActiveAt: new Date(),
    } as any,
  });
  // Create shadow appUser so bot-only users can generate without web registration
  const shadowApiKey = crypto.randomBytes(16).toString('hex');
  const shadowAppUser = await prisma.appUser.upsert({
    where: { telegramId },
    update: { telegramChatId: ctx.chat!.id.toString(), chatId: ctx.chat!.id.toString(), lastAccessAt: new Date() },
    create: {
      telegramId,
      telegramChatId: ctx.chat!.id.toString(),
      chatId: ctx.chat!.id.toString(),
      username: `tg_${telegramId}`,
      apiKey: shadowApiKey,
      source: 'telegram_bot',
    } as any,
  });
  if (!newBotUser.appUserId) {
    await (prisma as any).botUser.update({ where: { telegramId }, data: { appUserId: shadowAppUser.id } });
  }
  const newBalanceLine = `\n\n💳 Токенов на балансе: ${newBotUser.botCredits}`;
  await ctx.reply(
    `Добро пожаловать в Преподавай 🎓\n\nЯ Ваш интеллектуальный помощник для:\n— Создания учебных материалов\n— Планирования уроков\n— Создания красочных презентаций\n— Методической поддержки\n— Создания интерактивных игр${newBalanceLine}`,
    { reply_markup: { keyboard: [[{ text: MINI_APP_BTN }]], resize_keyboard: true } },
  );
  await ctx.reply(
    `📌 *Как пользоваться:*\n\n1. Выберите инструмент из списка ниже\n2. Ответьте на несколько вопросов\n3. Получите готовый материал в PDF\n\nКаждая генерация стоит 3 токена.`,
    { parse_mode: 'Markdown' },
  );
  await ctx.reply('🛠️ *Выберите инструмент:*', { parse_mode: 'Markdown', reply_markup: buildToolSelectionKeyboard() });
});

// ── Команда /generate ─────────────────────────────────────────────────────────
bot.command('generate', async (ctx: Context) => {
  const telegramId = ctx.from?.id.toString();
  if (!telegramId) return;
  console.log(`[Bot] /generate from ${telegramId}`);

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
  console.log(`[Bot] /cancel from ${telegramId}`);

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
  console.log(`[Bot] callback from ${telegramId}: ${data}`);

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

  } else if (data.startsWith('g:ms:')) {
    // Toggle multiselect option
    const idx = parseInt(data.slice(5), 10);
    if (!Number.isFinite(idx) || idx < 0 || idx > 20) return;

    const session = getGenSession(telegramId);
    if (!session) { await ctx.reply('⏰ Сессия истекла. Начните заново: /generate'); return; }

    const tool = getToolConfig(session.toolKey);
    if (!tool) return;

    const field = tool.fields[session.fieldIndex];
    if (!field || field.type !== 'multiselect') return;

    const options = field.options ?? [];
    if (idx >= options.length) return;

    const current = new Set((session.params[field.key] || '').split(',').filter(Boolean));
    const optValue = options[idx].value;
    if (current.has(optValue)) {
      current.delete(optValue);
    } else {
      current.add(optValue);
    }
    session.params[field.key] = Array.from(current).join(',');

    // Edit the keyboard in-place
    await ctx.editMessageReplyMarkup({ reply_markup: buildMultiselectKeyboard(field, session) }).catch(() => null);

  } else if (data === 'g:msok') {
    // Confirm multiselect
    const session = getGenSession(telegramId);
    if (!session) { await ctx.reply('⏰ Сессия истекла. Начните заново: /generate'); return; }

    const tool = getToolConfig(session.toolKey);
    if (!tool) return;

    const field = tool.fields[session.fieldIndex];
    if (!field || field.type !== 'multiselect') return;

    const selected = (session.params[field.key] || '').split(',').filter(Boolean);
    if (selected.length === 0) {
      await ctx.reply('⚠️ Выберите хотя бы один раздел');
      return;
    }

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
    if ((field as any).skipToEnd) {
      session.fieldIndex = tool.fields.length;
    } else {
      session.fieldIndex++;
    }
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

    // Проверяем бот-кредиты
    const botUser = await (prisma as any).botUser.findUnique({ where: { telegramId } });
    if (!botUser || botUser.botCredits < 3) {
      await ctx.reply('❌ Недостаточно токенов для генерации.\n\nОбратитесь к администратору для пополнения баланса.');
      genSessions.delete(telegramId);
      return;
    }

    genSessions.delete(telegramId);
    lastGenAt.set(telegramId, Date.now());

    await ctx.reply(`⏳ Генерирую ${tool.emoji} *${tool.label}*...\n_${tool.estimatedTime}_`, { parse_mode: 'Markdown' });

    try {
      const token = await getApiToken(user.username, await ensureApiKey(user));
      if (!token) { await ctx.reply('❌ Ошибка авторизации. Попробуйте позже или обратитесь в поддержку.'); return; }

      if (tool.serviceType === 'games') {
        const result = await callGamesApi(token, session.params.type, session.params.topic);
        // Списываем 3 бот-токена
        const updated = await (prisma as any).botUser.update({
          where: { telegramId },
          data: {
            botCredits: { decrement: 3 },
            totalGenerations: { increment: 1 },
            generationsThisMonth: { increment: 1 },
            lastGenerationAt: new Date(),
          },
        });
        const kb = new InlineKeyboard().url('🎮 Открыть игру', result.url);
        await ctx.reply(`🎮 *Игра готова!*\n\nТема: _${session.params.topic}_\n\nНажмите кнопку, чтобы открыть:`, { parse_mode: 'Markdown', reply_markup: kb });
        await ctx.reply(`💳 Осталось токенов: *${updated.botCredits}*`, { parse_mode: 'Markdown' });
        // Игры доставляются сразу — показываем клавиатуру здесь
        await ctx.reply('🛠️ *Выберите инструмент:*', { parse_mode: 'Markdown', reply_markup: buildToolSelectionKeyboard() });
      } else {
        let apiParams: Record<string, any> = { ...session.params };
        if (tool.key === 'lesson-preparation' && typeof apiParams.generationTypes === 'string') {
          apiParams.generationTypes = apiParams.generationTypes.split(',').filter(Boolean);
        }
        const result = await callGenerationApi(token, tool.generationType, apiParams);
        // Списываем 3 бот-токена
        const updated = await (prisma as any).botUser.update({
          where: { telegramId },
          data: {
            botCredits: { decrement: 3 },
            totalGenerations: { increment: 1 },
            generationsThisMonth: { increment: 1 },
            lastGenerationAt: new Date(),
          },
        });
        if (result.status === 'completed') {
          await ctx.reply(`✅ Готово! Отправляю ${tool.emoji} *${tool.label}* в чат...\n\n💳 Осталось токенов: *${updated.botCredits}*`, { parse_mode: 'Markdown' });
        } else {
          await ctx.reply(`✅ Задача принята! Результат придёт в этот чат, как только будет готов.\n\n💳 Осталось токенов: *${updated.botCredits}*`, { parse_mode: 'Markdown' });
        }
        // Клавиатура придёт после реальной доставки PDF через sendGenerationResult
      }
    } catch (err: any) {
      await ctx.reply(humanizeError(err));
      // При ошибке — показываем клавиатуру сразу, т.к. доставки не будет
      await ctx.reply('🛠️ *Выберите инструмент:*', { parse_mode: 'Markdown', reply_markup: buildToolSelectionKeyboard() });
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
  console.log(`[Bot] text from ${telegramId}: "${text.slice(0, 80)}"`);

  // Кнопка мини-приложения
  if (text === MINI_APP_BTN) {
    const botUser = await (prisma as any).botUser.findUnique({ where: { telegramId } });
    const isRegistered = botUser?.registrationStatus === 'registered';
    const webAppUrl = process.env.WEBAPP_URL || 'https://prepodavai.ru';
    if (isRegistered) {
      await ctx.reply('Нажмите кнопку, чтобы открыть Преподавай:', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🚀 Открыть Преподавай', web_app: { url: `${webAppUrl}/dashboard` } }],
          ],
        },
      });
    } else {
      await startRegistration(ctx, telegramId);
    }
    return;
  }

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
    if (field.type === 'multiselect') {
      await ctx.reply('👆 Нажмите на кнопки выше, чтобы выбрать разделы, затем нажмите *Готово*.',  { parse_mode: 'Markdown' });
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

  if (regState.step === 'awaiting_email') {
    await handleEmailInput(ctx, telegramId, regState, text);
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
    genSessions.delete(telegramId);
    await ctx.reply('❌ Не удалось загрузить файл. Сессия сброшена — начните заново: /generate');
  }
}

bot.on('message:photo', (ctx) => { console.log(`[Bot] photo from ${ctx.from?.id}`); return handleFileMessage(ctx, 'photo'); });
bot.on('message:document', (ctx) => { console.log(`[Bot] document from ${ctx.from?.id}`); return handleFileMessage(ctx, 'document'); });
bot.on('message:audio', (ctx) => { console.log(`[Bot] audio from ${ctx.from?.id}`); return handleFileMessage(ctx, 'document'); });
bot.on('message:voice', (ctx) => handleFileMessage(ctx, 'document'));
bot.on('message:video', (ctx) => handleFileMessage(ctx, 'document'));

// ── Запуск ────────────────────────────────────────────────────────────────────
bot.catch((err) => {
  console.error('[Bot] Uncaught middleware error:', err.error ?? err);
  console.error('[Bot] Update:', JSON.stringify(err.ctx?.update ?? {}));
});

// ── Запуск с диагностикой связи ───────────────────────────────────────────────
// Раньше bot.start() висел молча, если egress на api.telegram.org заблокирован
// (контейнер «Up», апдейтов нет). Теперь сначала пробуем getMe с явным таймаутом
// и логируем результат — причина видна сразу в `docker logs`.
async function bootstrap() {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.error('[Bot] FATAL: TELEGRAM_BOT_TOKEN не задан. Останавливаюсь.');
    process.exit(1);
  }

  try {
    const me = await bot.api.getMe();
    console.log(`[Bot] getMe OK: @${me.username} (id=${me.id}) — связь с Telegram есть.`);
  } catch (err: any) {
    // Самый частый кейс на РФ-хостинге: ETIMEDOUT/ECONNREFUSED — egress заблокирован.
    console.error(
      '[Bot] FATAL: не удалось достучаться до Telegram API (getMe). ' +
        'Проверь egress контейнера до api.telegram.org. ' +
        'Варианты: network_mode: host, либо TELEGRAM_PROXY / TELEGRAM_API_ROOT.',
    );
    console.error('[Bot] Детали ошибки:', err?.message ?? err);
    // Падаем, чтобы restart-политика не делала вид, что всё ок, и проблема была заметна.
    process.exit(1);
  }

  // Логируем сетевые ошибки самого поллинга (getUpdates), которых раньше не было видно.
  bot.start({
    onStart: () => console.log('🤖 Telegram bot connected and polling'),
  }).catch((err) => {
    console.error('[Bot] FATAL: polling упал:', err);
    process.exit(1);
  });
  console.log('🤖 Telegram bot started (registration + generation active)');
}

bootstrap();

process.on('SIGTERM', async () => { bot.stop(); await prisma.$disconnect(); process.exit(0); });
process.on('SIGINT', async () => { bot.stop(); await prisma.$disconnect(); process.exit(0); });
