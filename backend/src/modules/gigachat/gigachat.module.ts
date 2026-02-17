import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GigachatService } from './gigachat.service';
import { GigachatController } from './gigachat.controller';
import { GigachatGenerationsService } from './gigachat-generations.service';
import { GenerationsModule } from '../generations/generations.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { FilesModule } from '../files/files.module';
import { HtmlExportService } from '../../common/services/html-export.service';

@Module({
    imports: [
        ConfigModule,
        forwardRef(() => GenerationsModule),
        SubscriptionsModule,
        FilesModule,
    ],
    controllers: [GigachatController],
    providers: [
        GigachatService,
        GigachatGenerationsService,
        HtmlExportService,
    ],
    exports: [GigachatService],
})
export class GigachatModule { }
