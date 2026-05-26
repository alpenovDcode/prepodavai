import { Injectable, Logger } from '@nestjs/common';

export interface GenerationSession {
  toolKey: string;
  fieldIndex: number;
  params: Record<string, string>;
  lastActivity: number;
}

/** TTL сессии без активности — 10 минут */
const SESSION_TTL_MS = 10 * 60 * 1000;
/** Защита от DoS: максимум одновременных сессий */
const MAX_SESSIONS = 300;

@Injectable()
export class BotSessionService {
  private readonly logger = new Logger(BotSessionService.name);
  private readonly sessions = new Map<string, GenerationSession>();

  /**
   * Создать новую сессию для пользователя.
   * Если сессия уже была — перезаписывает её (пользователь начал заново).
   */
  create(telegramId: string, toolKey: string): GenerationSession {
    this.evictExpired();

    if (!this.sessions.has(telegramId) && this.sessions.size >= MAX_SESSIONS) {
      this.logger.warn(`[BotSession] Max sessions reached (${MAX_SESSIONS}), rejecting ${telegramId}`);
      throw new Error('Сервис временно перегружен. Попробуйте через минуту.');
    }

    const session: GenerationSession = {
      toolKey,
      fieldIndex: 0,
      params: {},
      lastActivity: Date.now(),
    };
    this.sessions.set(telegramId, session);
    return session;
  }

  /**
   * Получить сессию. Возвращает undefined если истекла или не существует.
   */
  get(telegramId: string): GenerationSession | undefined {
    const session = this.sessions.get(telegramId);
    if (!session) return undefined;

    if (Date.now() - session.lastActivity > SESSION_TTL_MS) {
      this.sessions.delete(telegramId);
      return undefined;
    }

    session.lastActivity = Date.now();
    return session;
  }

  delete(telegramId: string): void {
    this.sessions.delete(telegramId);
  }

  has(telegramId: string): boolean {
    return this.get(telegramId) !== undefined;
  }

  /** Удаление всех протухших сессий (вызывается перед созданием новой) */
  private evictExpired(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions.entries()) {
      if (now - session.lastActivity > SESSION_TTL_MS) {
        this.sessions.delete(id);
      }
    }
  }
}
