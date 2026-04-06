import { Injectable, Logger } from '@nestjs/common';
import { ReplicateService } from '../replicate/replicate.service';
import { ChatMessageDto, SendMessageDto, ChatResponseDto } from './dto/ai-assistant.dto';

@Injectable()
export class AiAssistantService {
  private readonly logger = new Logger(AiAssistantService.name);

  constructor(private readonly replicateService: ReplicateService) {}

  async sendStudentMessage(dto: SendMessageDto): Promise<ChatResponseDto> {
    try {
      this.logger.log(`AI Teacher (student) message received: ${dto.message.substring(0, 50)}...`);

      const systemPrompt = `Ты — ИИ Учитель, помощник для учеников. Твоя задача — помогать ученикам в обучении.

ВАЖНЫЕ ПРАВИЛА:
1. НИКОГДА не давай готовых ответов и решений на задачи, упражнения или домашние задания.
2. Вместо этого давай методические подсказки, наводящие вопросы и рекомендации, которые помогут ученику самому найти ответ.
3. Объясняй концепции и теорию простым, понятным языком.
4. Если ученик просит решить задачу — объясни подход к решению, но не решай за него.
5. Подбадривай и мотивируй ученика.
6. Рекомендуй дополнительные материалы для изучения темы.
7. Если ученик допускает ошибку — мягко укажи на неё и помоги понять, почему это неправильно.
8. Будь терпеливым, дружелюбным и поддерживающим.
9. Отвечай на русском языке.`;

      let conversationPrompt = '';

      if (dto.history && dto.history.length > 0) {
        conversationPrompt = dto.history
          .map((msg) => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
          .join('\n\n');
        conversationPrompt += '\n\n';
      }

      conversationPrompt += `User: ${dto.message}`;

      const fullPrompt = `${systemPrompt}\n\n${conversationPrompt}\n\nAssistant:`;

      const assistantMessage = await this.replicateService.createCompletion(
        fullPrompt,
        'google/gemini-3-flash',
        {
          temperature: 0.7,
          max_tokens: 2048,
        },
      );

      const updatedHistory: ChatMessageDto[] = [
        ...(dto.history || []),
        { role: 'user', content: dto.message },
        { role: 'assistant', content: assistantMessage || 'Извините, не удалось получить ответ.' },
      ];

      this.logger.log(`AI Teacher (student) response generated successfully`);

      return {
        response: assistantMessage || 'Извините, не удалось получить ответ.',
        history: updatedHistory,
      };
    } catch (error: any) {
      this.logger.error(`AI Teacher (student) error: ${error.message}`, error.stack);
      throw error;
    }
  }

  async sendMessage(dto: SendMessageDto): Promise<ChatResponseDto> {
    try {
      this.logger.log(`AI Assistant message received: ${dto.message.substring(0, 50)}...`);

      // Формируем промпт с историей
      const systemPrompt =
        'Ты - AI-ассистент для учителей. Помогай создавать учебные материалы, отвечай на вопросы по педагогике и образованию. Будь полезным, дружелюбным и профессиональным.';

      let conversationPrompt = '';

      // Добавляем историю, если есть
      if (dto.history && dto.history.length > 0) {
        conversationPrompt = dto.history
          .map((msg) => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
          .join('\n\n');
        conversationPrompt += '\n\n';
      }

      conversationPrompt += `User: ${dto.message}`;

      const fullPrompt = `${systemPrompt}\n\n${conversationPrompt}\n\nAssistant:`;

      // Отправляем запрос в Replicate
      const assistantMessage = await this.replicateService.createCompletion(
        fullPrompt,
        'google/gemini-3-flash',
        {
          temperature: 0.7,
          max_tokens: 2048,
        },
      );

      // Формируем обновленную историю
      const updatedHistory: ChatMessageDto[] = [
        ...(dto.history || []),
        { role: 'user', content: dto.message },
        { role: 'assistant', content: assistantMessage || 'Извините, не удалось получить ответ.' },
      ];

      this.logger.log(`AI Assistant response generated successfully`);

      return {
        response: assistantMessage || 'Извините, не удалось получить ответ.',
        history: updatedHistory,
      };
    } catch (error: any) {
      this.logger.error(`AI Assistant error: ${error.message}`, error.stack);
      throw error;
    }
  }
}
