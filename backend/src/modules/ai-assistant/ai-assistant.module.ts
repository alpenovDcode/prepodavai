import { Module } from '@nestjs/common';
import { AiAssistantController } from './ai-assistant.controller';
import { AiAssistantService } from './ai-assistant.service';
import { GigachatModule } from '../gigachat/gigachat.module';
import { FilesModule } from '../files/files.module';
import { GenerationsModule } from '../generations/generations.module';

@Module({
    imports: [GigachatModule, FilesModule, GenerationsModule],
    controllers: [AiAssistantController],
    providers: [AiAssistantService],
    exports: [AiAssistantService],
})
export class AiAssistantModule { }
