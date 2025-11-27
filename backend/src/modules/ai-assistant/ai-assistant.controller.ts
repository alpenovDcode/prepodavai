import {
    Body,
    Controller,
    Post,
    Request,
    UseGuards,
    Logger,
} from '@nestjs/common';
import { AiAssistantService } from './ai-assistant.service';
import { SendMessageDto, ChatResponseDto } from './dto/ai-assistant.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('ai-assistant')
export class AiAssistantController {
    private readonly logger = new Logger(AiAssistantController.name);

    constructor(private readonly aiAssistantService: AiAssistantService) { }

    @Post('chat')
    @UseGuards(JwtAuthGuard)
    async chat(
        @Request() req,
        @Body() dto: SendMessageDto,
    ): Promise<ChatResponseDto> {
        try {
            this.logger.log(`Chat request from user ${req.user.id}`);
            return await this.aiAssistantService.sendMessage(dto);
        } catch (error: any) {
            this.logger.error(`Chat error: ${error.message}`, error.stack);
            throw error;
        }
    }
}
