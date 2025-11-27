import { Module } from '@nestjs/common';
import { AiAssistantController } from './ai-assistant.controller';
import { AiAssistantService } from './ai-assistant.service';
import { GigachatModule } from '../gigachat/gigachat.module';

@Module({
    imports: [GigachatModule],
    controllers: [AiAssistantController],
    providers: [AiAssistantService],
    exports: [AiAssistantService],
})
export class AiAssistantModule { }
