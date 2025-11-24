import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getUserSubscription(@Request() req) {
    return this.subscriptionsService.getUserSubscription(req.user.id);
  }

  @Get('info')
  @UseGuards(JwtAuthGuard)
  async getUserSubscriptionInfo(@Request() req) {
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
}
