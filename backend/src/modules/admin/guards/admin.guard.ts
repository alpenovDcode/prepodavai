import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Guard для проверки прав администратора
 * Проверяет наличие ADMIN_USER_IDS в переменных окружения
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private configService: ConfigService) { }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.id) {
      throw new ForbiddenException('User not authenticated');
    }

    // Получаем список ID администраторов из переменных окружения
    const adminUserIds = this.configService
      .get<string>('ADMIN_USER_IDS', '')
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0);

    // Если список пуст, разрешаем доступ только в development
    if (adminUserIds.length === 0) {
      const nodeEnv = this.configService.get<string>('NODE_ENV', 'development');
      if (nodeEnv === 'production') {
        throw new ForbiddenException(
          'Admin access is restricted. Set ADMIN_USER_IDS in environment variables.',
        );
      }
      // В development разрешаем доступ всем авторизованным пользователям
      console.warn(
        '⚠️ Admin endpoints are accessible to all authenticated users in development mode',
      );
      return true;
    }

    // Проверяем, является ли пользователь администратором
    if (!adminUserIds.includes(user.id)) {
      console.error(`Admin access denied. User ID: ${user.id}, Allowed IDs: ${JSON.stringify(adminUserIds)}`);
      throw new ForbiddenException('Access denied. Admin privileges required.');
    }

    return true;
  }
}
