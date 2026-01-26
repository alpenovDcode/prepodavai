import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { GenerationsController } from './generations.controller';
import { GenerationsService } from './generations.service';
import { GenerationHelpersService } from './generation-helpers.service';
import { GenerationQueueService } from './generation-queue.service';
import { TelegramSenderProcessor } from './processors/telegram-sender.processor';
import { GammaPollingProcessor } from './processors/gamma-polling.processor';
import { ReplicatePresentationProcessor } from './processors/replicate-presentation.processor';
import { TelegramModule } from '../telegram/telegram.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { GigachatModule } from '../gigachat/gigachat.module';
import { GammaModule } from '../gamma/gamma.module';
import { HtmlPostprocessorService } from '../../common/services/html-postprocessor.service';
import { FilesModule } from '../files/files.module';

@Module({
  imports: [
    // Очередь для генераций
    BullModule.registerQueue({
      name: 'generation',
    }),
    // Очередь для отправки в Telegram
    BullModule.registerQueue({
      name: 'telegram-send',
    }),
    // Очередь для polling статуса Gamma
    BullModule.registerQueue({
      name: 'gamma-polling',
    }),
    BullModule.registerQueue({
      name: 'replicate-presentation',
    }),
    TelegramModule,
    SubscriptionsModule,
    forwardRef(() => GigachatModule),
    GammaModule,
    FilesModule,
  ],
  controllers: [GenerationsController],
  providers: [
    GenerationsService,
    GenerationHelpersService,
    GenerationQueueService,
    TelegramSenderProcessor,
    GammaPollingProcessor,
    ReplicatePresentationProcessor,
    HtmlPostprocessorService,
  ],
  exports: [GenerationsService, GenerationQueueService, GenerationHelpersService],
})
export class GenerationsModule { }
