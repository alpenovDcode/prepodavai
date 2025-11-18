import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { WebhookAuthGuard } from './guards/webhook-auth.guard';
import { GenerationsModule } from '../generations/generations.module';

@Module({
  imports: [GenerationsModule],
  controllers: [WebhooksController],
  providers: [WebhooksService, WebhookAuthGuard],
})
export class WebhooksModule {}

