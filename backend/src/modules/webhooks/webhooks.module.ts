import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { WebhookAuthGuard } from './guards/webhook-auth.guard';
import { GenerationsModule } from '../generations/generations.module';
import { FilesModule } from '../files/files.module';

import { PhotosessionController } from './photosession.controller';
import { ReplicateCallbackController } from './replicate-callback.controller';

import { HtmlPostprocessorService } from '../../common/services/html-postprocessor.service';

@Module({
  imports: [GenerationsModule, FilesModule],
  controllers: [WebhooksController, PhotosessionController, ReplicateCallbackController],
  providers: [WebhooksService, WebhookAuthGuard, HtmlPostprocessorService],
})
export class WebhooksModule {}
