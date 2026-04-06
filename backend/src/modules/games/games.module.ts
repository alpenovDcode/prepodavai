import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GamesController } from './games.controller';
import { GamesService } from './games.service';
import { ReplicateModule } from '../replicate/replicate.module';

import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  imports: [ConfigModule, ReplicateModule, SubscriptionsModule],
  controllers: [GamesController],
  providers: [GamesService],
})
export class GamesModule {}
