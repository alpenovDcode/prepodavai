import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { WebhookAuthGuard } from './guards/webhook-auth.guard';
import { GenerationsModule } from '../generations/generations.module';

import { PhotosessionController } from './photosession.controller';
import { ReplicateCallbackController } from './replicate-callback.controller';

@Module({
  imports: [GenerationsModule],
  controllers: [WebhooksController, PhotosessionController, ReplicateCallbackController],
  providers: [WebhooksService, WebhookAuthGuard],
})
export class WebhooksModule { }
