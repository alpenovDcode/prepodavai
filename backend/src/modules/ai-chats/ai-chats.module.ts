import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AiAssistantModule } from '../ai-assistant/ai-assistant.module';
import { AiChatsController } from './ai-chats.controller';
import { AiChatsService } from './ai-chats.service';

@Module({
  imports: [PrismaModule, AiAssistantModule],
  controllers: [AiChatsController],
  providers: [AiChatsService],
})
export class AiChatsModule {}
