import { Controller, Get, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GamificationService } from './gamification.service';

@Controller('gamification')
@UseGuards(JwtAuthGuard)
export class GamificationController {
  constructor(private readonly service: GamificationService) {}

  /**
   * Сводка для ученика (используется на /student/dashboard и /student/achievements).
   * Авторизация: req.user.id должен быть studentId (студенческий JWT).
   */
  @Get('me')
  async getMyProgress(@Request() req: any) {
    return this.service.getProgress(req.user.id);
  }

  /**
   * Ученик зашёл — отметить день активности. Идемпотентно (повторный вызов в тот же день — no-op).
   * Фронт вызывает на /student/dashboard mount.
   */
  @Post('check-in')
  async checkIn(@Request() req: any) {
    return this.service.checkIn(req.user.id);
  }
}
