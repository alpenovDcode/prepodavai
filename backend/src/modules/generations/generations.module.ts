import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { GenerationsController } from './generations.controller';
import { GenerationsService } from './generations.service';
import { GenerationHelpersService } from './generation-helpers.service';
import { GenerationQueueService } from './generation-queue.service';
import { TelegramSenderProcessor } from './processors/telegram-sender.processor';
import { TelegramModule } from '../telegram/telegram.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { GigachatModule } from '../gigachat/gigachat.module';
import { HtmlPostprocessorService } from '../../common/services/html-postprocessor.service';

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
    TelegramModule,
    SubscriptionsModule,
    forwardRef(() => GigachatModule),
  ],
  controllers: [GenerationsController],
  providers: [
    GenerationsService,
    GenerationHelpersService,
    GenerationQueueService,
    TelegramSenderProcessor,
    HtmlPostprocessorService,
  ],
  exports: [GenerationsService, GenerationQueueService, GenerationHelpersService],
})
export class GenerationsModule { }
