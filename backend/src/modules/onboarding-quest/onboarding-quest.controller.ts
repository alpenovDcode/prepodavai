import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { OnboardingQuestService } from './onboarding-quest.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('onboarding-quest')
@UseGuards(JwtAuthGuard)
export class OnboardingQuestController {
  constructor(private readonly questService: OnboardingQuestService) {}

  /**
   * Статус квеста текущего пользователя.
   * Только чтение — шаги завершаются исключительно через внутренние события.
   */
  @Get('status')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async getStatus(@Request() req) {
    const status = await this.questService.getQuestStatus(req.user.id);
    return { success: true, quest: status };
  }
}
