import { Injectable, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class GenerationsThrottlerGuard extends ThrottlerGuard {
  
  // Определяем трекер: по ID пользователя, если он авторизован, иначе по IP
  protected async getTracker(req: Record<string, any>): Promise<string> {
    if (req.user && req.user.id) {
      return `user-${req.user.id}`;
    }
    const ip = req.headers['x-forwarded-for'] || req.connection?.remoteAddress || req.ip;
    return `ip-${ip}`;
  }

  protected async handleRequest(requestPropsOrContext: any, arg2?: any, arg3?: any, arg4?: any): Promise<boolean> {
    // В зависимости от минорной версии @nestjs/throttler (v4 vs v5), 
    // первый аргумент может быть либо ExecutionContext, либо объектом ThrottlerRequest.
    const isContext = typeof requestPropsOrContext.switchToHttp === 'function';
    const context = isContext ? requestPropsOrContext : requestPropsOrContext.context;
    
    const req = context.switchToHttp().getRequest();
    const tracker = isContext ? await this.getTracker(req) : await requestPropsOrContext.getTracker(req);
    
    const throttlerName = isContext ? (arg4?.name || 'default') : (requestPropsOrContext.throttler?.name || 'default');
    const key = isContext 
      ? this.generateKey(context, tracker, throttlerName) 
      : requestPropsOrContext.generateKey(context, tracker, throttlerName);

    // Динамические лимиты для генераций
    let dynamicLimit = 5; // Для неавторизованных/публичных маршрутов (5 в минуту)
    let dynamicTtl = 60000; // 1 минута

    if (req.user) {
        // Лимиты для авторизованных пользователей 
        // В идеале мы можем извлекать данные о тарифе из кэша (чтобы не нагружать БД)
        // Если план не передан напрямую, даем пользователям 15 запросов в минуту
        // Если это PRO или BUSINESS, даем 30-50.
        // Заглушка, пока роль не обогатится напрямую в JWT или профиле пользователя:
        const userRole = req.user.plan || 'START';
        
        switch (userRole) {
            case 'START':
                dynamicLimit = 15;
                break;
            case 'PRO':
                dynamicLimit = 30;
                break;
            case 'BUSINESS':
                dynamicLimit = 50;
                break;
            default:
                dynamicLimit = 15;
        }
    }

    // Пытаемся адаптировать вызов increment под возможные сигнатуры v5. 
    // В текущей установленной версии signature: increment(key, ttl)
    const { totalHits } = await this.storageService.increment(
      key,
      dynamicTtl
    );

    if (totalHits > dynamicLimit) {
      throw new HttpException(
         'Слишком много запросов на генерацию. Пожалуйста, подождите минуту перед следующей попыткой.',
         HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
