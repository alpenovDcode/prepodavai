import { Module, OnModuleInit } from '@nestjs/common';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { PrismaService } from '../../common/prisma/prisma.service';

@Module({
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule implements OnModuleInit {
  constructor(
    private prisma: PrismaService,
    private subscriptionsService: SubscriptionsService,
  ) {}

  async onModuleInit() {
    // Инициализация тарифных планов и стоимости операций
    await this.subscriptionsService.initializePlans();
    await this.subscriptionsService.initializeCreditCosts();
  }
}
