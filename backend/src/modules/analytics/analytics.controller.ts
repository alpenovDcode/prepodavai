import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
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

  @Get('teacher-overview')
  async getTeacherOverview(@Request() req: any) {
    return this.analyticsService.getTeacherOverview(req.user.id);
  }

  @Get('weekly-activity')
  async getWeeklyActivity(@Request() req: any, @Query('range') range?: string) {
    const normalized = range === 'month' ? 'month' : 'week';
    return this.analyticsService.getWeeklyActivity(req.user.id, normalized);
  }

  // ===== Redesign V2: страница /dashboard/analytics =====

  @Get('overview-v2')
  async getOverviewV2(
    @Request() req: any,
    @Query('range') range?: string,
    @Query('classId') classId?: string,
    @Query('filter') filter?: string,
  ) {
    return this.analyticsService.getOverviewV2(req.user.id, {
      range: range ?? 'month',
      classId: classId && classId !== 'all' ? classId : undefined,
      filter: (filter as any) ?? 'all',
    });
  }

  @Get('students-leaderboard')
  async getStudentsLeaderboard(
    @Request() req: any,
    @Query('range') range?: string,
    @Query('classId') classId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.analyticsService.getStudentsLeaderboard(req.user.id, {
      range: range ?? 'month',
      classId: classId && classId !== 'all' ? classId : undefined,
      page: Math.max(1, parseInt(page ?? '1', 10) || 1),
      pageSize: Math.min(100, Math.max(1, parseInt(pageSize ?? '20', 10) || 20)),
    });
  }
}
