import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GamesController } from './games.controller';
import { GamesService } from './games.service';
import { GigachatModule } from '../gigachat/gigachat.module';

import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
    imports: [ConfigModule, GigachatModule, SubscriptionsModule],
    controllers: [GamesController],
    providers: [GamesService],
})
export class GamesModule { }
