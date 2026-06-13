import {
  Injectable,
  NestMiddleware,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as jwt from 'jsonwebtoken';
import { ConfigService } from '@nestjs/config';
import { SystemService } from './system.service';

/**
 * Глобально блокирует non-admin запросы при включённом maintenance-режиме.
 * Whitelist (всегда пропускаем):
 *   - /api/system/*    — публичный статус, чтобы фронт мог рисовать заглушку
 *   - /api/admin/*     — админская панель должна оставаться доступной
 *   - /api/auth/*      — вход админу
 *   - /api/health      — health-check для k8s/nginx
 *   - /api/webhooks/*  — внешние вебхуки (платежи, Replicate) не должны падать
 */
const WHITELIST_PREFIXES = [
  '/api/system',
  '/api/admin',
  '/api/auth',
  '/api/health',
  '/api/webhooks',
  '/api/webhook',
];

@Injectable()
export class MaintenanceMiddleware implements NestMiddleware {
  constructor(
    private readonly systemService: SystemService,
    private readonly configService: ConfigService,
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const status = await this.systemService.getMaintenanceStatus().catch(() => null);
    if (!status || !status.enabled) {
      return next();
    }

    const url = req.originalUrl || req.url || '';
    if (WHITELIST_PREFIXES.some((p) => url.startsWith(p))) {
      return next();
    }

    // Запросы от ботов (Telegram standalone, MAX) проходят в обход maintenance:
    // тех. работы — это про веб-интерфейс, ботам мы не показываем заглушку,
    // они должны продолжать обслуживать пользователей. Бот сам ставит этот
    // заголовок при вызове API.
    const botSource = req.headers['x-bot-source'];
    if (typeof botSource === 'string' && botSource.trim().length > 0) {
      return next();
    }

    // Бот может также положить признак в тело запроса как _miniAppPlatform —
    // на случай, если заголовок забыли пробросить.
    const body = (req as any).body;
    const platform = body?._miniAppPlatform;
    if (platform === 'telegram' || platform === 'max') {
      return next();
    }

    // Достаём userId из Bearer JWT (без полноценной валидации — это уже сделает
    // дальше JwtAuthGuard). Нам нужно лишь сверить с admin-списком, чтобы
    // пропустить администратора при maintenance.
    const userId = this.extractUserIdFromAuth(req);
    if (userId && this.systemService.isAdminUserId(userId)) {
      return next();
    }

    throw new ServiceUnavailableException({
      maintenance: true,
      message: status.message,
    });
  }

  private extractUserIdFromAuth(req: Request): string | null {
    try {
      const header = req.headers.authorization;
      if (!header || !header.startsWith('Bearer ')) return null;
      const token = header.slice('Bearer '.length).trim();
      const secret = this.configService.get<string>('JWT_SECRET');
      if (!secret) return null;
      const payload = jwt.verify(token, secret) as any;
      return payload?.sub || payload?.id || payload?.userId || null;
    } catch {
      return null;
    }
  }
}
