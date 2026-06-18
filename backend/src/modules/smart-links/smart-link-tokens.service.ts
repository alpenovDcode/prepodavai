import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { randomBytes } from 'crypto';

/**
 * Хранилище одноразовых токенов для проброса UTM через Telegram-старт.
 *
 * Проблема: t.me/<bot>?start=<payload> поддерживает ТОЛЬКО короткий
 * payload (до 64 символов A-Za-z0-9_-), query-параметры за `?start=`
 * Telegram отбрасывает. То есть если редиректить на
 * `t.me/bot?start=ref&utm_source=ig` — `utm_source` потеряется.
 *
 * Решение: при клике по smart-link сохраняем UTM-параметры в Redis
 * под коротким random-токеном (TTL 30 минут — пока юзер не дойдёт до
 * бота). Редиректим на `t.me/bot?start=<token>`. Бот в обработчике
 * /start читает Redis по этому токену, применяет UTM к пользователю
 * и удаляет токен (поэтому одноразовый).
 */
export interface SmartLinkAttribution {
  linkId: string;
  slug: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  autoTags?: string[];
  anonId?: string; // чтобы потом склеить клиентские pre-reg события
  funnelId?: string; // если ссылка привязана к воронке — её welcome-конфиг
  createdAt: number; // ms
}

@Injectable()
export class SmartLinkTokensService implements OnModuleDestroy {
  private readonly logger = new Logger(SmartLinkTokensService.name);
  private readonly client: Redis;
  private static readonly KEY_PREFIX = 'smartlink:tok:';
  private static readonly TTL_SECONDS = 30 * 60; // 30 мин

  constructor(private readonly configService: ConfigService) {
    const url = this.configService.get<string>(
      'REDIS_URL',
      'redis://localhost:6379',
    );
    const parsed = new URL(url);
    this.client = new Redis({
      host: parsed.hostname,
      port: parseInt(parsed.port || '6379'),
      password: parsed.password || undefined,
      lazyConnect: false,
      maxRetriesPerRequest: 3,
    });
    this.client.on('error', (e) =>
      this.logger.warn(`Redis error: ${e?.message}`),
    );
  }

  async onModuleDestroy() {
    try {
      await this.client.quit();
    } catch {}
  }

  /**
   * Генерим короткий URL-safe токен (длина 14, ~80 бит энтропии — хватит
   * для 30-минутного окна без коллизий). Сохраняем атрибуцию, возвращаем
   * токен для вставки в `t.me/bot?start=<token>`.
   */
  async store(attribution: SmartLinkAttribution): Promise<string> {
    const token = randomBytes(10).toString('base64url'); // ~14 chars
    const payload = JSON.stringify({
      ...attribution,
      createdAt: Date.now(),
    });
    try {
      await this.client.set(
        SmartLinkTokensService.KEY_PREFIX + token,
        payload,
        'EX',
        SmartLinkTokensService.TTL_SECONDS,
      );
    } catch (e: any) {
      this.logger.warn(`store token failed: ${e?.message}`);
    }
    return token;
  }

  /**
   * Читает атрибуцию по токену. По умолчанию удаляет (одноразовое
   * использование), но опционально можно оставить (peek=true) — например
   * для аналитики, если бот вызывает повторно.
   */
  async consume(
    token: string,
    opts?: { peek?: boolean },
  ): Promise<SmartLinkAttribution | null> {
    if (!token || token.length > 32) return null;
    const key = SmartLinkTokensService.KEY_PREFIX + token;
    try {
      const raw = await this.client.get(key);
      if (!raw) return null;
      if (!opts?.peek) await this.client.del(key);
      return JSON.parse(raw) as SmartLinkAttribution;
    } catch (e: any) {
      this.logger.warn(`consume token failed: ${e?.message}`);
      return null;
    }
  }

  // ──────── Отложенная атрибуция: tgId → UTM на 30 дней ────────
  // Когда юзер кликнул и пришёл в бот, но ещё не зарегистрирован на платформе
  // (нет AppUser). Сохраняем атрибуцию по telegramId. Когда юзер позже введёт
  // email и пройдёт `verifyEmailCode`, auth.service подхватит UTM из этого
  // ключа и проставит на AppUser.

  private static readonly TG_PREFIX = 'smartlink:tgattr:';
  private static readonly TG_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 дней

  async storeForTgUser(tgId: string | number, data: SmartLinkAttribution) {
    try {
      await this.client.set(
        SmartLinkTokensService.TG_PREFIX + String(tgId),
        JSON.stringify(data),
        'EX',
        SmartLinkTokensService.TG_TTL_SECONDS,
      );
    } catch (e: any) {
      this.logger.warn(`storeForTgUser failed: ${e?.message}`);
    }
  }

  async getForTgUser(tgId: string | number, opts?: { peek?: boolean }): Promise<SmartLinkAttribution | null> {
    const key = SmartLinkTokensService.TG_PREFIX + String(tgId);
    try {
      const raw = await this.client.get(key);
      if (!raw) return null;
      if (!opts?.peek) await this.client.del(key);
      return JSON.parse(raw) as SmartLinkAttribution;
    } catch (e: any) {
      this.logger.warn(`getForTgUser failed: ${e?.message}`);
      return null;
    }
  }
}
