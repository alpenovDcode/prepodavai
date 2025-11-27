import { Injectable, Logger } from '@nestjs/common';
import { GigachatService } from '../gigachat/gigachat.service';
import { ChatMessageDto, SendMessageDto, ChatResponseDto } from './dto/ai-assistant.dto';

@Injectable()
export class AiAssistantService {
    private readonly logger = new Logger(AiAssistantService.name);

    constructor(private readonly gigachatService: GigachatService) { }

    async sendMessage(dto: SendMessageDto): Promise<ChatResponseDto> {
        try {
            this.logger.log(`AI Assistant message received: ${dto.message.substring(0, 50)}...`);

            // Формируем историю сообщений для GigaChat
            const messages: Array<{ role: string; content: string }> = [];

            // Добавляем системный промпт
            messages.push({
                role: 'system',
                content: 'Ты - AI-ассистент для учителей. Помогай создавать учебные материалы, отвечай на вопросы по педагогике и образованию. Будь полезным, дружелюбным и профессиональным.',
            });

            // Добавляем историю, если есть
            if (dto.history && dto.history.length > 0) {
                messages.push(...dto.history.map((msg) => ({
                    role: msg.role,
                    content: msg.content,
                })));
            }

            // Добавляем новое сообщение пользователя
            messages.push({
                role: 'user',
                content: dto.message,
            });

            // Отправляем запрос в GigaChat
            const response = await this.gigachatService.createChatCompletion({
                model: 'GigaChat-Max',
                messages,
                temperature: 0.7,
                max_tokens: 2048,
            }) as any;

            // Извлекаем ответ
            const assistantMessage = response.choices?.[0]?.message?.content || 'Извините, не удалось получить ответ.';

            // Формируем обновленную историю
            const updatedHistory: ChatMessageDto[] = [
                ...(dto.history || []),
                { role: 'user', content: dto.message },
                { role: 'assistant', content: assistantMessage },
            ];

            this.logger.log(`AI Assistant response generated successfully`);

            return {
                response: assistantMessage,
                history: updatedHistory,
            };
        } catch (error: any) {
            this.logger.error(`AI Assistant error: ${error.message}`, error.stack);
            throw error;
        }
    }
}
