import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { WebhookAuthGuard } from './guards/webhook-auth.guard';
import { GenerationsModule } from '../generations/generations.module';

import { PhotosessionController } from './photosession.controller';

@Module({
  imports: [GenerationsModule],
  controllers: [WebhooksController, PhotosessionController],
  providers: [WebhooksService, WebhookAuthGuard],
})
export class WebhooksModule { }
