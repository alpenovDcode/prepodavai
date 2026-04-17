import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AnalyticsService } from './analytics.service';

@Controller('analytics')
@UseGuards(JwtAuthGuard)
@SkipThrottle()
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('dashboard')
  async getDashboardData(@Request() req: any) {
    const userId = req.user.id;
    return this.analyticsService.getDashboardStats(userId);
  }

  @Get('live-stats')
  async getLiveStats(@Request() req: any) {
    const userId = req.user.id;
    return this.analyticsService.getQuickStats(userId);
  }
}
