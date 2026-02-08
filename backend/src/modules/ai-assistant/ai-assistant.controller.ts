import {
    Body,
    Controller,
    Post,
    Request,
    UseGuards,
    Logger,
    UseInterceptors,
    UploadedFile,
    BadRequestException,
} from '@nestjs/common';
import { AiAssistantService } from './ai-assistant.service';
import { SendMessageDto, ChatResponseDto } from './dto/ai-assistant.dto';
import { AnalyzeSalesChatDto } from './dto/sales-analysis.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import { FilesService } from '../files/files.service';
import { GenerationsService } from '../generations/generations.service';

@Controller('ai-assistant')
export class AiAssistantController {
    private readonly logger = new Logger(AiAssistantController.name);

    constructor(
        private readonly aiAssistantService: AiAssistantService,
        private readonly filesService: FilesService,
        private readonly generationsService: GenerationsService,
    ) { }

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

    @Post('sales-analysis')
    @UseGuards(JwtAuthGuard)
    @UseInterceptors(FileInterceptor('file'))
    async analyzeSalesChat(
        @Request() req,
        @UploadedFile() file: Express.Multer.File,
        @Body() body: AnalyzeSalesChatDto,
    ) {
        let fileUrl: string | undefined;

        if (file) {
            const fileData = await this.filesService.saveBuffer(
                file.buffer,
                file.originalname || `sales-analysis-${Date.now()}.jpg`
            );
            fileUrl = fileData.url;
        } else if (body.fileUrl) {
            fileUrl = body.fileUrl;
        }

        if (!fileUrl) {
            throw new BadRequestException('File or fileUrl is required');
        }

        return this.generationsService.createGeneration({
            userId: req.user.id,
            generationType: 'sales-analysis',
            inputParams: {
                fileUrl,
            },
        });
    }
}
