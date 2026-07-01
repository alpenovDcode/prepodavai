import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SystemService } from '../../system/system.service';

const OP_KEY = 'tutor_exchange';

@Injectable()
export class ExchangeEnabledGuard implements CanActivate {
  constructor(private readonly systemService: SystemService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const userId: string | undefined = req?.user?.id;

    if (userId && this.systemService.isAdminUserId(userId)) {
      return true;
    }

    const status = await this.systemService.getToolStatus(OP_KEY);
    if (status.enabled) return true;

    throw new ServiceUnavailableException({
      tutorExchangeDisabled: true,
      message: status.message,
    });
  }
}
