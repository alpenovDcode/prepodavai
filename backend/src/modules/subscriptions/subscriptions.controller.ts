import { Controller, Get, Post, Body, UseGuards, Request } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getUserSubscription(@Request() req) {
    if (req.user.role === 'student') {
      return {
        success: true,
        subscription: {
          id: 'student_sub',
          status: 'active',
          creditsBalance: 999999,
          extraCredits: 0,
          creditsUsed: 0,
          overageCreditsUsed: 0,
          totalAvailable: 999999,
          startDate: new Date(),
          endDate: new Date(Date.now() + 31536000000), // 1 year
        },
        plan: {
          planKey: 'student',
          planName: 'Ученик',
          monthlyCredits: 999999,
          allowOverage: false,
          features: ['Базовые функции ученика'],
        },
      };
    }
    return this.subscriptionsService.getUserSubscription(req.user.id);
  }

  @Get('info')
  @UseGuards(JwtAuthGuard)
  async getUserSubscriptionInfo(@Request() req) {
    if (req.user.role === 'student') {
      return { success: true };
    }
    return this.subscriptionsService.getUserSubscription(req.user.id);
  }

  @Get('plans')
  async getAvailablePlans() {
    return this.subscriptionsService.getAvailablePlans();
  }

  @Get('costs')
  async getCreditCosts() {
    return this.subscriptionsService.getCreditCosts();
  }

  @Post('upgrade')
  @UseGuards(JwtAuthGuard)
  async upgradePlan(@Request() req: any, @Body() body: { planKey: string }) {
    return this.subscriptionsService.upgradePlan(req.user.id, body.planKey);
  }
}
