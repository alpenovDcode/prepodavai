import { Bot, Context, InlineKeyboard, BotConfig } from 'grammy';
import * as dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { TOOL_CONFIGS, ToolConfig, FieldConfig, getToolConfig } from './tool-configs';

dotenv.config();

const prisma = new PrismaClient();
const API_URL = process.env.API_URL || 'http://localhost:3001';

// ── Откуда Подписки (tgtrack) ─────────────────────────────────────────────────
const TGTRACK_API_KEY = process.env.TGTRACK_API_KEY || '';
const TGTRACK_BASE = 'https://bot-api.tgtrack.ru/v1';

function tgtrack(method: string, body: Record<string, any>): void {
  if (!TGTRACK_API_KEY) return;
  fetch(`${TGTRACK_BASE}/${TGTRACK_API_KEY}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch((err) => console.warn(`[tgtrack] ${method} failed:`, err));
}

/**
 * Собирает client-конфиг grammY с учётом окружения:
 *  - TELEGRAM_API_ROOT — кастомный Bot API endpoint (зеркало / локальный bot-api-server).
 *  - TELEGRAM_PROXY / HTTPS_PROXY / ALL_PROXY — HTTP(S)-прокси для egress (РКН блокирует
 *    прямой IPv4-путь к api.telegram.org с РФ-хостинга).
 *
 * ВАЖНО про реализацию прокси: grammY ходит в Telegram через node-fetch-совместимый слой
 * (его дефолтный baseFetchConfig содержит `compress: true` — опция node-fetch). node-fetch
 * НЕ понимает undici `dispatcher`/`setGlobalDispatcher` — ему нужен `agent`. Поэтому
 * используем `https-proxy-agent` и кладём его в `baseFetchConfig.agent`. Проверено:
 * undici ProxyAgent (и глобальный, и per-request) с grammy НЕ работает, а https-proxy-agent — да.
 *
 * Если ничего не задано — прямой доступ (прежнее поведение).
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
      const u = new URL(proxyUrl);
      // HttpsProxyAgent сам разбирает userinfo (user:pass@host) и шлёт Proxy-Authorization.
      const agent = new HttpsProxyAgent(proxyUrl);
      client.baseFetchConfig = { agent } as any;
      console.log(
        `[Bot] Routing Telegram egress through proxy: ${u.protocol}//${u.host} (auth: ${u.username ? 'yes' : 'no'})`,
      );
    } catch (e) {
      console.error(`[Bot] Failed to init proxy agent for "${proxyUrl}". Проверь URL прокси:`, e);
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

// ── Типы: платформенные фичи ──────────────────────────────────────────────────
interface PlatformState {
  genOffset: number;
  classes: Array<{ id: string; name: string; studentCount: number }>;
  genId?: string;
  genTopic?: string;
}

// ── Константы: регистрация ────────────────────────────────────────────────────
const MAX_CONCURRENT_REG_SESSIONS = 500;
const MINI_APP_BTN = '📱 Открыть Преподавай';

// ── Кнопки главного меню ──────────────────────────────────────────────────────
const BTN_CREATE = '🛠️ Создать материал';
const BTN_MYGENS = '📋 Мои генерации';
const BTN_CLASSES = '📚 Классы';
const BTN_ANALYTICS = '📊 Аналитика';

function buildMainMenuKeyboard() {
  return {
    keyboard: [
      [{ text: BTN_CREATE }, { text: BTN_MYGENS }],
      [{ text: BTN_CLASSES }, { text: BTN_ANALYTICS }],
      [{ text: MINI_APP_BTN }],
    ],
    resize_keyboard: true,
  };
}

// ── Подписка на канал ─────────────────────────────────────────────────────────
const TELEGRAM_CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID || '';
const TELEGRAM_CHANNEL_URL = process.env.TELEGRAM_CHANNEL_URL || 'https://t.me/esvasilevaru';

const SUBSCRIPTION_TEXT =
  'Преподавай — бесплатный ИИ-сервис для репетиторов.\n\n' +
  'Он помогает быстрее готовиться к урокам:\n' +
  '— составлять планы занятий\n' +
  '— генерировать рабочие листы\n' +
  '— подбирать упражнения\n' +
  '— делать домашку\n' +
  '— объяснять темы простым языком\n\n' +
  'Чтобы пользоваться сервисом бесплатно, надо быть подписанным на канал «Прорыв в репетиторстве».\n' +
  'После подписки нажмите «Я подписался» — и бот откроет доступ.';

// ── Константы: генерация ──────────────────────────────────────────────────────
const GEN_SESSION_TTL_MS = 10 * 60_000;
const GEN_RATE_LIMIT_MS = 15_000;
const MAX_GEN_SESSIONS = 300;
const MAX_CALLBACK_DATA_LEN = 32;

// ── Константы: платформенные фичи ─────────────────────────────────────────────
const GEN_PAGE_SIZE = 5;
const GEN_TYPE_LABELS: Record<string, string> = {
  'worksheet': 'Рабочий лист',
  'quiz': 'Тест',
  'quiz-generation': 'Тест',
  'lesson-plan': 'План урока',
  'vocabulary': 'Словарный запас',
  'message': 'Сообщение',
  'feedback': 'Отзыв',
  'presentation': 'Презентация',
  'image': 'Изображение',
  'photosession': 'Фотосессия',
  'exam-variant': 'Экзамен',
  'lesson-preparation': 'Подготовка к уроку',
  'content-adaptation': 'Адаптация контента',
  'video-analysis': 'Анализ видео',
  'transcribe-video': 'Расшифровка видео',
  'sales-advisor': 'Советник продаж',
  'unpacking': 'Разбор темы',
  'assistant': 'Ассистент',
};

// ── State ─────────────────────────────────────────────────────────────────────
const regStates = new Map<string, RegistrationState>();
const genSessions = new Map<string, GenerationSession>();
const lastGenAt = new Map<string, number>();
const platformStates = new Map<string, PlatformState>();
const jwtCache = new Map<string, { token: string; expiresAt: number }>();
const JWT_CACHE_TTL = 8 * 60_000;

// ── Generation session helpers ────────────────────────────────────────────────
function createGenSession(telegramId: string, toolKey: string): GenerationSession {
  const now = Date.now();
  for (const [id, s] of genSessions) {
    if (now - s.lastActivity > GEN_SESSION_TTL_MS) genSessions.delete(id);
  }
  for (const [id, ts] of lastGenAt) {
    if (now - ts > GEN_RATE_LIMIT_MS * 10) lastGenAt.delete(id);
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
    if (val !== undefined && val !== '') lines.push(`• ${sanitizeMd(val)}`);
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
  const cached = jwtCache.get(username);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.token;
  }

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
    const token = data.token ?? null;
    if (token) {
      if (jwtCache.size > 1000) {
        const now = Date.now();
        for (const [k, v] of jwtCache) {
          if (v.expiresAt <= now) jwtCache.delete(k);
        }
      }
      jwtCache.set(username, { token, expiresAt: Date.now() + JWT_CACHE_TTL });
    }
    return token;
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

  const tgApiRoot = (process.env.TELEGRAM_API_ROOT ?? 'https://api.telegram.org').replace(/\/$/, '');
  const downloadUrl = `${tgApiRoot}/file/bot${botToken}/${filePath}`;
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
    return '❌ Аккаунт не найден. Используйте /start для перезапуска.';
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

  if (state.locked) return;
  state.locked = true;

  const exists = await prisma.appUser.findFirst({ where: { email } });
  if (exists) {
    state.locked = false;
    await ctx.reply('⚠️ Этот email уже зарегистрирован.\n\nЕсли это ваш аккаунт — войдите на сайте и привяжите Telegram в настройках профиля.');
    return;
  }

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

      // New web users get business plan with 1500 credits + remaining botCredits
      const businessPlan = await tx.subscriptionPlan.findUnique({ where: { planKey: 'business' } });
      if (businessPlan) {
        const existingBot = await (tx as any).botUser.findUnique({ where: { telegramId }, select: { botCredits: true } });
        const bonusCredits = existingBot?.botCredits ?? 0;
        const now = new Date();
        const endDate = new Date(now);
        endDate.setMonth(endDate.getMonth() + 1);
        await tx.userSubscription.create({
          data: {
            userId: appUser.id, planId: businessPlan.id, status: 'active',
            creditsBalance: 1500 + bonusCredits, extraCredits: 0, creditsUsed: 0,
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

    // Глубокая цель: регистрация (fire-and-forget)
    tgtrack('send_reach_goal', { user_id: telegramId, target: 'registration_completed' });

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
  } catch (err: any) {
    console.error(`[RegBot] Create user error for ${telegramId}:`, err);
    if (err?.code === 'P2002') {
      regStates.delete(telegramId);
      await ctx.reply('⚠️ Аккаунт с таким email уже существует.\n\nЕсли это ваш аккаунт — войдите на сайте и привяжите Telegram в настройках профиля.');
    } else {
      await ctx.reply('❌ Не удалось создать аккаунт. Попробуйте позже или обратитесь в поддержку.');
    }
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
  const telegramChatId = ctx.chat!.id.toString();
  const platformName = user.username ? `@${user.username}` : user.first_name || `id${user.id}`;

  // Читаем текущие данные чтобы не перезаписывать уже заполненные поля
  const webUser = await prisma.appUser.findUnique({ where: { id: linkToken.userId } });
  if (!webUser) {
    await ctx.reply('❌ Аккаунт не найден. Попробуйте позже.');
    return;
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Переносим историю генераций shadow-аккаунта и освобождаем его telegramId
      if (isShadowAccount && alreadyLinked) {
        await (tx as any).userGeneration.updateMany({
          where: { userId: alreadyLinked.id },
          data: { userId: linkToken.userId },
        });
        await tx.appUser.update({
          where: { id: alreadyLinked.id },
          data: { telegramId: null, telegramChatId: null } as any,
        });
      }
      await tx.appUser.update({
        where: { id: linkToken.userId },
        data: {
          telegramId: user.id.toString(),
          telegramChatId,
          chatId: telegramChatId,
          // Обновляем имя/фамилию только если ещё не заданы
          ...(webUser.firstName ? {} : { firstName: user.first_name || undefined }),
          ...(webUser.lastName ? {} : { lastName: user.last_name || undefined }),
        } as any,
      });
      await tx.linkToken.update({
        where: { id: linkToken.id },
        data: { status: 'completed', linkedId: user.id.toString(), linkedName: platformName },
      });
    });
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

// ── Token deduction helpers ───────────────────────────────────────────────────
async function deductTgTokens(
  telegramId: string,
  appUserId: string,
): Promise<{ success: boolean; remaining: number; source: 'subscription' | 'bot' }> {
  const subscription = await (prisma as any).userSubscription.findUnique({ where: { userId: appUserId } });

  if (subscription && subscription.status === 'active') {
    const updated = await (prisma as any).$transaction(async (tx: any) => {
      const sub = await tx.userSubscription.findUnique({ where: { userId: appUserId } });
      if (!sub || sub.creditsBalance + sub.extraCredits < 3) return null;
      let newExtra = sub.extraCredits;
      let newBalance = sub.creditsBalance;
      if (newExtra >= 3) {
        newExtra -= 3;
      } else {
        const remainder = 3 - newExtra;
        newExtra = 0;
        newBalance -= remainder;
      }
      return tx.userSubscription.update({ where: { id: sub.id }, data: { creditsBalance: newBalance, extraCredits: newExtra } });
    });
    if (!updated) {
      const sub = await (prisma as any).userSubscription.findUnique({ where: { userId: appUserId } });
      return { success: false, remaining: (sub?.creditsBalance ?? 0) + (sub?.extraCredits ?? 0), source: 'subscription' };
    }
    return { success: true, remaining: updated.creditsBalance + updated.extraCredits, source: 'subscription' };
  }

  const deducted = await (prisma as any).botUser.updateMany({
    where: { telegramId, botCredits: { gte: 3 } },
    data: { botCredits: { decrement: 3 } },
  });
  if (deducted.count === 0) {
    const bu = await (prisma as any).botUser.findUnique({ where: { telegramId }, select: { botCredits: true } });
    return { success: false, remaining: bu?.botCredits ?? 0, source: 'bot' };
  }
  const bu = await (prisma as any).botUser.findUnique({ where: { telegramId }, select: { botCredits: true } });
  return { success: true, remaining: bu?.botCredits ?? 0, source: 'bot' };
}

async function refundTgTokens(telegramId: string, appUserId: string, source: 'subscription' | 'bot'): Promise<void> {
  if (source === 'subscription') {
    await (prisma as any).userSubscription.updateMany({ where: { userId: appUserId }, data: { creditsBalance: { increment: 3 } } });
  } else {
    await (prisma as any).botUser.update({ where: { telegramId }, data: { botCredits: { increment: 3 } } }).catch(() => null);
  }
}

// ── Platform features helpers ─────────────────────────────────────────────────

function getPlatformState(telegramId: string): PlatformState {
  if (platformStates.size > 2000) {
    const toDelete = [...platformStates.keys()].slice(0, 1000);
    toDelete.forEach((k) => platformStates.delete(k));
  }
  if (!platformStates.has(telegramId)) {
    platformStates.set(telegramId, { genOffset: 0, classes: [] });
  }
  return platformStates.get(telegramId)!;
}

async function callApi(token: string, path: string, method = 'GET', body?: any): Promise<any> {
  const opts: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
  };
  if (body) opts.body = JSON.stringify(body);
  const resp = await fetch(`${API_URL}/api/${path}`, opts);
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ message: `HTTP ${resp.status}` })) as any;
    throw new Error(err.message ?? `HTTP ${resp.status}`);
  }
  return resp.json();
}

function genStatusIcon(status: string): string {
  if (status === 'completed') return '✅';
  if (status === 'failed') return '❌';
  return '⏳';
}

function extractGenTopic(params: any): string {
  if (!params || typeof params !== 'object') return '';
  return (params.topic || params.subject || params.lessonTopic || params.theme || '').slice(0, 35);
}

function sanitizeMd(text: string): string {
  return text.replace(/[_*`[\]]/g, '');
}

async function showGenerations(ctx: Context, telegramId: string, offset: number, editInPlace = false) {
  const user = await prisma.appUser.findUnique({ where: { telegramId } }) as any;
  if (!user) { await ctx.reply('❌ Аккаунт не найден. Используйте /start.'); return; }

  const apiToken = await getApiToken(user.username, await ensureApiKey(user)).catch(() => null);
  if (!apiToken) { await ctx.reply('❌ Ошибка авторизации.'); return; }

  let data: any;
  try {
    data = await callApi(apiToken, `generate/history?limit=${GEN_PAGE_SIZE}&offset=${offset}`);
  } catch {
    await ctx.reply('❌ Не удалось загрузить генерации. Попробуйте позже.');
    return;
  }

  const gens: any[] = data.generations ?? [];
  const total: number = data.total ?? 0;
  const state = getPlatformState(telegramId);
  state.genOffset = offset;

  if (!gens.length) {
    if (offset === 0) {
      await ctx.reply('📋 Генераций пока нет. Создайте первую с помощью кнопки «' + BTN_CREATE + '».');
    } else {
      state.genOffset = 0;
      await ctx.reply('📋 Больше генераций нет.');
    }
    return;
  }

  const lines = gens.map((g: any, i: number) => {
    const icon = genStatusIcon(g.status);
    const label = GEN_TYPE_LABELS[g.type] ?? g.type;
    const topic = extractGenTopic(g.params);
    const date = new Date(g.createdAt).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
    return `${offset + i + 1}. ${icon} ${label}${topic ? `: _${sanitizeMd(topic)}_` : ''} — ${date}`;
  }).join('\n');

  const kb = new InlineKeyboard();
  gens.forEach((_: any, i: number) => {
    if (i === 3) kb.row();
    kb.text(`${offset + i + 1}`, `pf:gi:${i}`);
  });
  const hasPrev = offset > 0;
  const hasNext = offset + GEN_PAGE_SIZE < total;
  if (hasPrev || hasNext) {
    kb.row();
    if (hasPrev) kb.text('◀️', 'pf:gp');
    if (hasNext) kb.text('▶️', 'pf:gn');
  }

  const text = `📋 *Генерации* (${offset + 1}–${Math.min(offset + GEN_PAGE_SIZE, total)} из ${total}):\n\n${lines}\n\nНажмите номер для деталей.`;

  if (editInPlace) {
    await (ctx as any).editMessageText(text, { parse_mode: 'Markdown', reply_markup: kb }).catch(async () => {
      await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: kb });
    });
  } else {
    await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: kb });
  }
}

async function showGenDetail(ctx: Context, telegramId: string, idx: number) {
  const state = getPlatformState(telegramId);
  const user = await prisma.appUser.findUnique({ where: { telegramId } }) as any;
  if (!user) { await ctx.reply('❌ Аккаунт не найден. Используйте /start.'); return; }

  const apiToken = await getApiToken(user.username, await ensureApiKey(user)).catch(() => null);
  if (!apiToken) { await ctx.reply('❌ Ошибка авторизации.'); return; }

  let data: any;
  try {
    data = await callApi(apiToken, `generate/history?limit=1&offset=${state.genOffset + idx}`);
  } catch {
    await ctx.reply('❌ Не удалось загрузить генерацию. Попробуйте позже.');
    return;
  }

  const gen = data.generations?.[0];
  if (!gen) { await ctx.reply('❌ Генерация не найдена.'); return; }

  state.genId = gen.id;
  const topic = extractGenTopic(gen.params);
  state.genTopic = topic || (GEN_TYPE_LABELS[gen.type] ?? gen.type);

  const icon = genStatusIcon(gen.status);
  const label = GEN_TYPE_LABELS[gen.type] ?? gen.type;
  const date = new Date(gen.createdAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  const text = `${icon} *${label}*${topic ? `\nТема: _${sanitizeMd(topic)}_` : ''}\nДата: ${date}\nСтатус: ${gen.status}`;

  const kb = new InlineKeyboard();
  if (gen.status === 'completed') kb.text('📚 Выдать классу', 'pf:hw');
  kb.row().text('◀️ К списку', 'pf:gen');

  await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: kb });
}

async function showClasses(ctx: Context, telegramId: string) {
  const user = await prisma.appUser.findUnique({ where: { telegramId } }) as any;
  if (!user) { await ctx.reply('❌ Аккаунт не найден.'); return; }

  const apiToken = await getApiToken(user.username, await ensureApiKey(user)).catch(() => null);
  if (!apiToken) { await ctx.reply('❌ Ошибка авторизации.'); return; }

  let classes: any[];
  try {
    classes = await callApi(apiToken, 'classes');
  } catch {
    await ctx.reply('❌ Не удалось загрузить классы. Попробуйте позже.');
    return;
  }

  const state = getPlatformState(telegramId);
  state.classes = classes.map((c: any) => ({
    id: c.id,
    name: c.name,
    studentCount: c._count?.students ?? c.students?.length ?? 0,
  }));

  if (!classes.length) {
    await ctx.reply('📚 Классов пока нет. Создайте их на prepodavai.ru.');
    return;
  }

  const lines = classes.map((c: any, i: number) => `${i + 1}. *${sanitizeMd(c.name)}* — ${c._count?.students ?? 0} уч.`).join('\n');

  const kb = new InlineKeyboard();
  classes.forEach((_: any, i: number) => {
    if (i > 0 && i % 3 === 0) kb.row();
    kb.text(`${i + 1}`, `pf:ci:${i}`);
  });

  await ctx.reply(`📚 *Ваши классы:*\n\n${lines}\n\nНажмите номер для просмотра учеников.`, { parse_mode: 'Markdown', reply_markup: kb });
}

async function showClassDetail(ctx: Context, telegramId: string, idx: number) {
  const state = getPlatformState(telegramId);
  if (!state.classes[idx]) { await ctx.reply('❌ Класс не найден. Обновите список кнопкой «' + BTN_CLASSES + '».'); return; }

  const user = await prisma.appUser.findUnique({ where: { telegramId } }) as any;
  if (!user) { await ctx.reply('❌ Аккаунт не найден. Используйте /start.'); return; }

  const apiToken = await getApiToken(user.username, await ensureApiKey(user)).catch(() => null);
  if (!apiToken) { await ctx.reply('❌ Ошибка авторизации.'); return; }

  const cls = state.classes[idx];
  let classData: any;
  try {
    classData = await callApi(apiToken, `classes/${cls.id}`);
  } catch {
    await ctx.reply('❌ Не удалось загрузить данные класса.');
    return;
  }

  const students: any[] = classData.students ?? [];
  if (!students.length) {
    await ctx.reply(`📚 *${sanitizeMd(cls.name)}*\n\nУчеников пока нет.`, { parse_mode: 'Markdown' });
    return;
  }

  const riskMap: Record<string, string> = {};
  try {
    const analytics = await callApi(apiToken, `classes/${cls.id}/analytics`);
    for (const s of analytics?.studentBreakdown ?? []) {
      riskMap[s.id] = s.riskLevel ?? 'good';
    }
  } catch { /* optional */ }

  const riskIcon = (id: string) => riskMap[id] === 'risk' ? ' 🔴' : riskMap[id] === 'watch' ? ' 🟡' : '';

  const lines = students.map((s: any, i: number) => `${i + 1}. ${sanitizeMd(s.name)}${riskIcon(s.id)}`).join('\n');
  const legendLine = Object.values(riskMap).some(v => v === 'risk' || v === 'watch') ? '\n\n🔴 риск  🟡 внимание' : '';

  await ctx.reply(`📚 *${sanitizeMd(cls.name)}* — ${students.length} уч.\n\n${lines}${legendLine}`, { parse_mode: 'Markdown' });
}

async function showHomeworkClassPicker(ctx: Context, telegramId: string) {
  const state = getPlatformState(telegramId);
  if (!state.genId) { await ctx.reply('❌ Выберите генерацию из списка сначала: «' + BTN_MYGENS + '».'); return; }

  const user = await prisma.appUser.findUnique({ where: { telegramId } }) as any;
  if (!user) { await ctx.reply('❌ Аккаунт не найден. Используйте /start.'); return; }

  const apiToken = await getApiToken(user.username, await ensureApiKey(user)).catch(() => null);
  if (!apiToken) { await ctx.reply('❌ Ошибка авторизации.'); return; }

  if (!state.classes.length) {
    try {
      const classes = await callApi(apiToken, 'classes');
      state.classes = classes.map((c: any) => ({ id: c.id, name: c.name, studentCount: c._count?.students ?? 0 }));
    } catch {
      await ctx.reply('❌ Не удалось загрузить классы.');
      return;
    }
  }

  if (!state.classes.length) {
    await ctx.reply('📚 Классов нет. Создайте класс на prepodavai.ru.');
    return;
  }

  const lines = state.classes.map((c, i) => `${i + 1}. *${sanitizeMd(c.name)}*`).join('\n');
  const kb = new InlineKeyboard();
  state.classes.forEach((_, i) => {
    if (i > 0 && i % 3 === 0) kb.row();
    kb.text(`${i + 1}`, `pf:hwi:${i}`);
  });

  await ctx.reply(
    `📚 Выдать *«${state.genTopic ?? 'материал'}»* классу:\n\n${lines}\n\nВыберите класс:`,
    { parse_mode: 'Markdown', reply_markup: kb },
  );
}

async function assignHomework(ctx: Context, telegramId: string, classIdx: number) {
  const state = getPlatformState(telegramId);
  if (!state.genId || !state.classes[classIdx]) {
    await ctx.reply('❌ Данные устарели. Начните заново: «' + BTN_MYGENS + '».');
    return;
  }

  const user = await prisma.appUser.findUnique({ where: { telegramId } }) as any;
  if (!user) { await ctx.reply('❌ Аккаунт не найден. Используйте /start.'); return; }

  const apiToken = await getApiToken(user.username, await ensureApiKey(user)).catch(() => null);
  if (!apiToken) { await ctx.reply('❌ Ошибка авторизации.'); return; }

  const cls = state.classes[classIdx];
  const topicTitle = state.genTopic || 'Материал из Telegram';

  await ctx.reply('⏳ Создаю задание...');

  try {
    const lesson = await callApi(apiToken, 'lessons', 'POST', { topic: topicTitle });
    await callApi(apiToken, 'assignments', 'POST', {
      lessonId: lesson.id,
      classId: cls.id,
      generationId: state.genId,
    });

    state.genId = undefined;
    state.genTopic = undefined;

    await ctx.reply(`✅ *Задание выдано классу «${sanitizeMd(cls.name)}»!*\n\nМатериал: _${sanitizeMd(topicTitle)}_`, { parse_mode: 'Markdown' });
  } catch (err: any) {
    console.error(`[PF] assignHomework error for ${telegramId}:`, err);
    await ctx.reply('❌ Не удалось создать задание. Попробуйте позже.');
  }
}

async function showAnalytics(ctx: Context, telegramId: string) {
  const user = await prisma.appUser.findUnique({ where: { telegramId } }) as any;
  if (!user) { await ctx.reply('❌ Аккаунт не найден.'); return; }

  const apiToken = await getApiToken(user.username, await ensureApiKey(user)).catch(() => null);
  if (!apiToken) { await ctx.reply('❌ Ошибка авторизации.'); return; }

  let overview: any;
  try {
    overview = await callApi(apiToken, 'analytics/teacher-overview');
  } catch {
    await ctx.reply('❌ Не удалось загрузить аналитику. Попробуйте позже.');
    return;
  }

  const pending = overview.pendingGrading?.total ?? 0;
  const pendingByClass: any[] = overview.pendingGrading?.byClass ?? [];
  const riskCount = overview.atRisk?.riskCount ?? 0;
  const watchCount = overview.atRisk?.watchCount ?? 0;
  const samples: any[] = overview.atRisk?.samples ?? [];
  const todayCount = overview.schedule?.todayCount ?? 0;
  const deadlines = overview.upcoming?.deadlinesIn7Days ?? 0;

  const lines: string[] = ['📊 *Аналитика*\n'];

  lines.push(`📝 *Ждут проверки:* ${pending}`);
  for (const p of pendingByClass.slice(0, 3)) {
    lines.push(`  • ${p.className}: ${p.pending}`);
  }

  lines.push(`\n👥 *Под наблюдением:* 🔴 ${riskCount} риск, 🟡 ${watchCount} внимание`);
  for (const s of samples.slice(0, 3)) {
    const icon = s.level === 'risk' ? '🔴' : '🟡';
    lines.push(`  ${icon} ${sanitizeMd(s.name)} (${sanitizeMd(s.className)})${s.avgGrade !== null ? ` — ср. ${s.avgGrade}` : ''}`);
  }

  lines.push(`\n📅 *Уроков сегодня:* ${todayCount}`);
  lines.push(`⏰ *Дедлайны (7 дней):* ${deadlines}`);

  await ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' });
}

// ── Подписка: клавиатура ──────────────────────────────────────────────────────
function buildSubscriptionKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .url('ПОДПИСАТЬСЯ НА КАНАЛ', TELEGRAM_CHANNEL_URL)
    .text('Я ПОДПИСАЛСЯ', 'sub:check');
}

async function checkChannelSubscription(_telegramId: string): Promise<boolean> {
  // TODO: раскомментировать когда бот будет добавлен в канал
  return true;
  // if (!TELEGRAM_CHANNEL_ID) {
  //   console.warn('[Sub] TELEGRAM_CHANNEL_ID not configured — skipping check, granting access');
  //   return true;
  // }
  // try {
  //   const member = await bot.api.getChatMember(TELEGRAM_CHANNEL_ID, parseInt(_telegramId, 10));
  //   return ['member', 'administrator', 'creator'].includes(member.status);
  // } catch (err: any) {
  //   console.error(`[Sub] Subscription check failed: ${err?.message}`);
  //   return false;
  // }
}

async function sendActivationFlow(ctx: Context): Promise<void> {
  await ctx.reply('Коллега, рада вас видеть 👋');

  const introVideoId = process.env.TELEGRAM_INTRO_VIDEO_ID;
  if (introVideoId) {
    await bot.api.sendVideoNote(ctx.chat!.id, introVideoId).catch((err: any) =>
      console.warn(`[Start] Failed to send intro video: ${err?.message}`),
    );
  }

  await ctx.reply(SUBSCRIPTION_TEXT, { reply_markup: buildSubscriptionKeyboard() });
}

async function handleSubscriptionCheck(ctx: Context, telegramId: string): Promise<void> {
  const isSubscribed = await checkChannelSubscription(telegramId);

  if (!isSubscribed) {
    await ctx.reply(
      'Пока не вижу подписку на канал.\n\nЧтобы открыть бесплатный доступ к Преподавай, подпишитесь на канал «Прорыв в репетиторстве», а потом нажмите «Я подписался».',
      { reply_markup: buildSubscriptionKeyboard() },
    );
    return;
  }

  await ctx.reply('Готово, доступ открыт ✅\n\nТеперь можете пользоваться Преподавай бесплатно, пока подписаны на канал «Прорыв в репетиторстве».');

  const user = ctx.from!;
  const chatId = ctx.chat!.id.toString();
  const shadowApiKey = crypto.randomBytes(16).toString('hex');
  const shadowAppUser = await prisma.appUser.upsert({
    where: { telegramId },
    update: { lastAccessAt: new Date() },
    create: {
      telegramId,
      telegramChatId: chatId,
      chatId,
      username: `tg_${telegramId}`,
      apiKey: shadowApiKey,
      source: 'telegram_bot',
    } as any,
  });

  const botUserRecord = await (prisma as any).botUser.upsert({
    where: { telegramId },
    update: { appUserId: shadowAppUser.id, lastActiveAt: new Date(), registrationStatus: 'subscribed' },
    create: {
      telegramId,
      appUserId: shadowAppUser.id,
      firstName: user.first_name || null,
      lastName: user.last_name || null,
      username: user.username || null,
      registrationStatus: 'subscribed',
      source: 'telegram_bot',
      lastActiveAt: new Date(),
    } as any,
  });

  const balanceLine = `\n\n💳 Токенов на балансе: ${botUserRecord.botCredits ?? 0}`;
  await ctx.reply(
    `Добро пожаловать в Преподавай 🎓\n\nЯ Ваш интеллектуальный помощник для:\n— Создания учебных материалов\n— Планирования уроков\n— Создания красочных презентаций\n— Методической поддержки\n— Создания интерактивных игр${balanceLine}`,
    { reply_markup: buildMainMenuKeyboard() },
  );
}

// ── Команда /start ────────────────────────────────────────────────────────────
bot.command('start', async (ctx: Context) => {
  const user = ctx.from;
  if (!user) return;
  const telegramId = user.id.toString();
  console.log(`[Bot] /start from ${telegramId} (@${user.username ?? 'no_username'})`);

  const payload = ctx.match as string | undefined;

  // Фиксируем старт бота в Откуда Подписки (fire-and-forget)
  tgtrack('user_did_start_bot', {
    user_id: telegramId,
    first_name: user.first_name || '',
    ...(user.last_name && { last_name: user.last_name }),
    ...(user.username && { username: user.username }),
    ...(payload && { start_value: payload }),
  });

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

    const sub = await (prisma as any).userSubscription.findUnique({ where: { userId: existingUser.id } });
    const displayBalance = sub && sub.status === 'active'
      ? sub.creditsBalance + sub.extraCredits
      : ((botUser as any).botCredits ?? 0);
    const balanceLine = `\n\n💳 Токенов на балансе: ${displayBalance}`;
    await ctx.reply(
      `Добро пожаловать в Преподавай 🎓\n\nЯ Ваш интеллектуальный помощник для:\n— Создания учебных материалов\n— Планирования уроков\n— Создания красочных презентаций\n— Методической поддержки\n— Создания интерактивных игр${balanceLine}`,
      { reply_markup: buildMainMenuKeyboard() },
    );
    return;
  }

  await (prisma as any).botUser.upsert({
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
  await sendActivationFlow(ctx);
});


// ── Callback queries (нажатия кнопок генерации) ───────────────────────────────
bot.on('callback_query:data', async (ctx: Context) => {
  const data = ctx.callbackQuery?.data ?? '';
  const telegramId = ctx.from?.id.toString();
  if (!telegramId) return;

  await ctx.answerCallbackQuery().catch(() => null);

  if (data === 'sub:check') {
    console.log(`[Bot] sub:check from ${telegramId}`);
    await handleSubscriptionCheck(ctx, telegramId);
    return;
  }

  if (data.startsWith('pf:')) {
    console.log(`[Bot] platform callback from ${telegramId}: ${data}`);

    if (data === 'pf:gen') {
      const state = getPlatformState(telegramId);
      await showGenerations(ctx, telegramId, state.genOffset, true);

    } else if (data === 'pf:gn') {
      const state = getPlatformState(telegramId);
      await showGenerations(ctx, telegramId, state.genOffset + GEN_PAGE_SIZE, true);

    } else if (data === 'pf:gp') {
      const state = getPlatformState(telegramId);
      await showGenerations(ctx, telegramId, Math.max(0, state.genOffset - GEN_PAGE_SIZE), true);

    } else if (data.startsWith('pf:gi:')) {
      const idx = parseInt(data.slice(6), 10);
      if (!Number.isFinite(idx) || idx < 0 || idx >= GEN_PAGE_SIZE) return;
      await showGenDetail(ctx, telegramId, idx);

    } else if (data === 'pf:cls') {
      await showClasses(ctx, telegramId);

    } else if (data.startsWith('pf:ci:')) {
      const idx = parseInt(data.slice(6), 10);
      if (!Number.isFinite(idx) || idx < 0 || idx > 49) return;
      await showClassDetail(ctx, telegramId, idx);

    } else if (data === 'pf:hw') {
      await showHomeworkClassPicker(ctx, telegramId);

    } else if (data.startsWith('pf:hwi:')) {
      const idx = parseInt(data.slice(7), 10);
      if (!Number.isFinite(idx) || idx < 0 || idx > 49) return;
      await assignHomework(ctx, telegramId, idx);

    } else if (data === 'pf:ana') {
      await showAnalytics(ctx, telegramId);
    }

    return;
  }

  if (!data.startsWith('g:')) return;
  console.log(`[Bot] callback from ${telegramId}: ${data}`);

  if (data.length > MAX_CALLBACK_DATA_LEN) return;

  if (data.startsWith('g:t:')) {
    // Выбор инструмента
    const toolKey = data.slice(4);
    const tool = getToolConfig(toolKey);
    if (!tool) return;

    // Отменяем регистрацию если была активна (иначе текстовый ответ уйдёт в reg flow)
    regStates.delete(telegramId);

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
    if (!session) { await ctx.reply('⏰ Сессия истекла. Начните заново: «' + BTN_CREATE + '».'); return; }

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
    if (!session) { await ctx.reply('⏰ Сессия истекла. Начните заново: «' + BTN_CREATE + '».'); return; }

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
    if (!session) { await ctx.reply('⏰ Сессия истекла. Начните заново: «' + BTN_CREATE + '».'); return; }

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
    if (!session) { await ctx.reply('⏰ Сессия истекла. Начните заново: «' + BTN_CREATE + '».'); return; }

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
    if (!session) { await ctx.reply('⏰ Сессия истекла. Начните заново: «' + BTN_CREATE + '».'); return; }

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

    // Атомарно списываем 3 токена: subscription если привязан, иначе botCredits
    const tokenResult = await deductTgTokens(telegramId, user.id);
    if (!tokenResult.success) {
      await ctx.reply('❌ Недостаточно токенов для генерации.\n\nОбратитесь к администратору для пополнения баланса.');
      genSessions.delete(telegramId);
      return;
    }

    genSessions.delete(telegramId);
    lastGenAt.set(telegramId, Date.now());

    await ctx.reply(`⏳ Генерирую ${tool.emoji} *${tool.label}*...\n_${tool.estimatedTime}_`, { parse_mode: 'Markdown' });

    try {
      const token = await getApiToken(user.username, await ensureApiKey(user));
      if (!token) {
        await refundTgTokens(telegramId, user.id, tokenResult.source);
        await ctx.reply('❌ Ошибка авторизации. Попробуйте позже или обратитесь в поддержку.');
        return;
      }

      if (tool.serviceType === 'games') {
        const result = await callGamesApi(token, session.params.type, session.params.topic);
        await (prisma as any).botUser.update({
          where: { telegramId },
          data: { totalGenerations: { increment: 1 }, generationsThisMonth: { increment: 1 }, lastGenerationAt: new Date() },
        });
        const kb = new InlineKeyboard().url('🎮 Открыть игру', result.url);
        await ctx.reply(`🎮 *Игра готова!*\n\nТема: _${session.params.topic}_\n\nНажмите кнопку, чтобы открыть:`, { parse_mode: 'Markdown', reply_markup: kb });
        await ctx.reply(`💳 Осталось токенов: *${tokenResult.remaining}*`, { parse_mode: 'Markdown' });
        await ctx.reply('🛠️ *Выберите инструмент:*', { parse_mode: 'Markdown', reply_markup: buildToolSelectionKeyboard() });
      } else {
        let apiParams: Record<string, any> = { ...session.params };
        if (tool.key === 'lesson-preparation' && typeof apiParams.generationTypes === 'string') {
          apiParams.generationTypes = apiParams.generationTypes.split(',').filter(Boolean);
        }
        const result = await callGenerationApi(token, tool.generationType, apiParams);
        tgtrack('send_reach_goal', { user_id: telegramId, target: 'generation_created' });
        if (result.status === 'failed') {
          await refundTgTokens(telegramId, user.id, tokenResult.source);
          await ctx.reply('❌ Генерация не удалась. Токены возвращены.');
          await ctx.reply('🛠️ *Выберите инструмент:*', { parse_mode: 'Markdown', reply_markup: buildToolSelectionKeyboard() });
          return;
        }
        await (prisma as any).botUser.update({
          where: { telegramId },
          data: { totalGenerations: { increment: 1 }, generationsThisMonth: { increment: 1 }, lastGenerationAt: new Date() },
        });
        if (result.status === 'completed') {
          await ctx.reply(`✅ Готово! Отправляю ${tool.emoji} *${tool.label}* в чат...\n\n💳 Осталось токенов: *${tokenResult.remaining}*`, { parse_mode: 'Markdown' });
        } else {
          await ctx.reply(`✅ Задача принята! Результат придёт в этот чат, как только будет готов.\n\n💳 Осталось токенов: *${tokenResult.remaining}*`, { parse_mode: 'Markdown' });
        }
      }
    } catch (err: any) {
      await refundTgTokens(telegramId, user.id, tokenResult.source);
      await ctx.reply(humanizeError(err));
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
    const appUser = await prisma.appUser.findUnique({ where: { telegramId } });
    const isRegistered = ['registered', 'linked'].includes(botUser?.registrationStatus) && !!appUser?.email;
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

  // Кнопки главного меню
  if (text === BTN_CREATE) {
    const user = await prisma.appUser.findUnique({ where: { telegramId } });
    if (!user) { await ctx.reply('❌ Аккаунт не найден. Используйте /start.'); return; }
    genSessions.delete(telegramId);
    await ctx.reply('🛠️ *Выберите инструмент:*', { parse_mode: 'Markdown', reply_markup: buildToolSelectionKeyboard() });
    return;
  }
  if (text === BTN_MYGENS) {
    const state = getPlatformState(telegramId);
    state.genOffset = 0;
    await showGenerations(ctx, telegramId, 0);
    return;
  }
  if (text === BTN_CLASSES) {
    await showClasses(ctx, telegramId);
    return;
  }
  if (text === BTN_ANALYTICS) {
    await showAnalytics(ctx, telegramId);
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
    await ctx.reply('❌ Не удалось загрузить файл. Сессия сброшена — начните заново: «' + BTN_CREATE + '».');
  }
}

bot.on('message:photo', (ctx) => { console.log(`[Bot] photo from ${ctx.from?.id}`); return handleFileMessage(ctx, 'photo'); });
bot.on('message:document', (ctx) => { console.log(`[Bot] document from ${ctx.from?.id}`); return handleFileMessage(ctx, 'document'); });
bot.on('message:audio', (ctx) => { console.log(`[Bot] audio from ${ctx.from?.id}`); return handleFileMessage(ctx, 'document'); });
bot.on('message:voice', (ctx) => handleFileMessage(ctx, 'document'));
bot.on('message:video', (ctx) => handleFileMessage(ctx, 'document'));

// Фиксируем блокировку бота пользователем → Откуда Подписки
bot.on('my_chat_member', (ctx) => {
  const newStatus = ctx.myChatMember?.new_chat_member?.status;
  if (newStatus === 'kicked' || newStatus === 'left') {
    const userId = ctx.from?.id.toString();
    if (userId) tgtrack('my_bot_was_stopped', { user_id: userId });
  }
});

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

  // getMe с ретраями: нестабильный egress/прокси может дать сбой на одной попытке,
  // но восстановиться на следующей. Не валим контейнер с первого таймаута —
  // пробуем несколько раз с нарастающей паузой. Контролируется GETME_RETRIES.
  const maxAttempts = Number(process.env.GETME_RETRIES || 5);
  let connected = false;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const me = await bot.api.getMe();
      console.log(`[Bot] getMe OK: @${me.username} (id=${me.id}) — связь с Telegram есть (попытка ${attempt}).`);
      connected = true;
      break;
    } catch (err: any) {
      console.error(`[Bot] getMe не удался (попытка ${attempt}/${maxAttempts}): ${err?.message ?? err}`);
      if (attempt < maxAttempts) {
        const delayMs = Math.min(2000 * attempt, 10_000);
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }

  if (!connected) {
    console.error(
      '[Bot] FATAL: не удалось достучаться до Telegram API после ' + maxAttempts + ' попыток. ' +
        'Проверь egress до api.telegram.org (РКН блокирует прямой IPv4). ' +
        'Нужен СТАБИЛЬНЫЙ прокси/туннель: TELEGRAM_PROXY / TELEGRAM_API_ROOT / network_mode: host.',
    );
    // Падаем, чтобы restart-политика подняла заново (и проблема была видна в логах).
    process.exit(1);
  }

  // grammY сам ретраит сетевые ошибки getUpdates, поэтому единичные блипы прокси
  // переживёт без падения. Логируем фатальный обрыв поллинга, если он случится.
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
