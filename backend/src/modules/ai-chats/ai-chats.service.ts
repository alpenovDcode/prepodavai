import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AiAssistantService } from '../ai-assistant/ai-assistant.service';
import { SendMessageDto } from './dto/ai-chats.dto';

const AI_MODEL = 'google/gemini-3-flash';

@Injectable()
export class AiChatsService {
  private readonly logger = new Logger(AiChatsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiAssistant: AiAssistantService,
  ) {}

  async listChats(userId: string) {
    const chats = await this.prisma.aiChat.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: { select: { messages: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    return {
      items: chats.map((c) => ({
        id: c.id,
        title: c.title,
        lastMessageAt: c.messages[0]?.createdAt ?? c.updatedAt,
        messagesCount: c._count.messages,
      })),
    };
  }

  async createChat(userId: string, title?: string) {
    const chat = await this.prisma.aiChat.create({
      data: { userId, title: title ?? 'Новый диалог' },
    });
    return { id: chat.id };
  }

  async getChat(userId: string, chatId: string) {
    const chat = await this.prisma.aiChat.findUnique({
      where: { id: chatId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!chat) throw new NotFoundException('Чат не найден');
    if (chat.userId !== userId) throw new ForbiddenException();
    return {
      id: chat.id,
      title: chat.title,
      messages: chat.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
        model: m.model ?? null,
      })),
    };
  }

  async sendMessage(userId: string, chatId: string, dto: SendMessageDto) {
    const chat = await this.prisma.aiChat.findUnique({
      where: { id: chatId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!chat) throw new NotFoundException('Чат не найден');
    if (chat.userId !== userId) throw new ForbiddenException();

    // Save user message
    const userMsg = await this.prisma.chatMessage.create({
      data: { chatId, userId, role: 'user', content: dto.content },
    });

    // Build history for AI
    const history = chat.messages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    // Update chat title if this is the first message
    const isFirst = chat.messages.length === 0;
    if (isFirst) {
      const title = dto.content.slice(0, 40) + (dto.content.length > 40 ? '…' : '');
      await this.prisma.aiChat.update({ where: { id: chatId }, data: { title } });
    }

    // Get AI response
    let aiContent: string;
    try {
      const result = await this.aiAssistant.sendStudentMessage({
        message: dto.content,
        history,
      });
      aiContent = result.response;
    } catch (e: any) {
      this.logger.error(`AI error: ${e.message}`);
      aiContent = 'Извините, произошла ошибка. Попробуйте ещё раз.';
    }

    // Save AI message
    const aiMsg = await this.prisma.chatMessage.create({
      data: { chatId, userId, role: 'assistant', content: aiContent, model: AI_MODEL },
    });

    // Touch updatedAt
    await this.prisma.aiChat.update({ where: { id: chatId }, data: { updatedAt: new Date() } });

    return {
      messages: [
        { id: userMsg.id, role: 'user', content: userMsg.content, createdAt: userMsg.createdAt, model: null },
        { id: aiMsg.id, role: 'assistant', content: aiMsg.content, createdAt: aiMsg.createdAt, model: AI_MODEL },
      ],
    };
  }

  async regenerate(userId: string, chatId: string, msgId: string) {
    const chat = await this.prisma.aiChat.findUnique({
      where: { id: chatId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!chat) throw new NotFoundException('Чат не найден');
    if (chat.userId !== userId) throw new ForbiddenException();

    const targetIdx = chat.messages.findIndex((m) => m.id === msgId);
    if (targetIdx === -1) throw new NotFoundException('Сообщение не найдено');

    // Delete the target AI message
    await this.prisma.chatMessage.delete({ where: { id: msgId } });

    // History before that message
    const history = chat.messages
      .slice(0, targetIdx)
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    const lastUser = history.filter((m) => m.role === 'user').at(-1);
    const userContent = lastUser?.content ?? '';

    let aiContent: string;
    try {
      const result = await this.aiAssistant.sendStudentMessage({
        message: userContent,
        history: history.slice(0, -1),
      });
      aiContent = result.response;
    } catch {
      aiContent = 'Извините, произошла ошибка. Попробуйте ещё раз.';
    }

    const newMsg = await this.prisma.chatMessage.create({
      data: { chatId, userId, role: 'assistant', content: aiContent, model: AI_MODEL },
    });

    await this.prisma.aiChat.update({ where: { id: chatId }, data: { updatedAt: new Date() } });

    return { id: newMsg.id, role: 'assistant', content: aiContent, createdAt: newMsg.createdAt, model: AI_MODEL };
  }

  async deleteChat(userId: string, chatId: string) {
    const chat = await this.prisma.aiChat.findUnique({ where: { id: chatId } });
    if (!chat) throw new NotFoundException('Чат не найден');
    if (chat.userId !== userId) throw new ForbiddenException();
    await this.prisma.aiChat.delete({ where: { id: chatId } });
    return { ok: true };
  }
}
