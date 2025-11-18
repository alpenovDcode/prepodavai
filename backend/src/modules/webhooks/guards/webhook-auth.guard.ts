import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class WebhookAuthGuard implements CanActivate {
  constructor(private configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    
    // Вариант 1: Проверка секрета в заголовке
    const webhookSecret = request.headers['x-webhook-secret'];
    const expectedSecret = this.configService.get<string>('WEBHOOK_SECRET');
    
    if (expectedSecret) {
      if (!webhookSecret || webhookSecret !== expectedSecret) {
        throw new UnauthorizedException('Invalid webhook secret');
      }
      return true;
    }

    // Вариант 2: IP whitelist (если используется)
    const allowedIPs = this.configService
      .get<string>('WEBHOOK_ALLOWED_IPS', '')
      .split(',')
      .map(ip => ip.trim())
      .filter(ip => ip.length > 0);
    
    if (allowedIPs.length > 0) {
      const clientIP = 
        request.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
        request.headers['x-real-ip'] ||
        request.ip ||
        request.connection.remoteAddress;
      
      if (!clientIP || !allowedIPs.includes(clientIP)) {
        throw new UnauthorizedException('IP not allowed');
      }
      return true;
    }

    // Если нет ни секрета, ни IP whitelist - предупреждение
    // В production это должно быть обязательно!
    const nodeEnv = this.configService.get<string>('NODE_ENV', 'development');
    if (nodeEnv === 'production') {
      throw new UnauthorizedException(
        'Webhook endpoints must be protected. Set WEBHOOK_SECRET or WEBHOOK_ALLOWED_IPS'
      );
    }

    // В development разрешаем без защиты (с предупреждением)
    console.warn('⚠️ Webhook endpoints are not protected! Set WEBHOOK_SECRET or WEBHOOK_ALLOWED_IPS');
    return true;
  }
}

