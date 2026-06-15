import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AiAssistantService } from '../ai-assistant/ai-assistant.service';
import { SendMessageDto } from './dto/ai-chats.dto';

const AI_MODEL = 'google/gemini-3-flash';

@Injectable()
export class AiChatsService {
  private readonly logger = new Logger(AiChatsService.name);
  private tablesEnsured = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiAssistant: AiAssistantService,
  ) {}

  /**
   * Ленивое создание таблиц ai_chats и chat_messages, если миграция ещё не
   * накатана на окружении (например, после отката). Идемпотентно: на чистой
   * базе после миграции это no-op.
   */
  private async ensureTables(): Promise<void> {
    if (this.tablesEnsured) return;
    try {
      await this.prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "ai_chats" (
          "id" TEXT NOT NULL,
          "userId" TEXT NOT NULL,
          "title" TEXT NOT NULL DEFAULT 'Новый диалог',
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "ai_chats_pkey" PRIMARY KEY ("id")
        );
      `);
      await this.prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ai_chats_userId_idx" ON "ai_chats"("userId");`);
      await this.prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "chat_messages" (
          "id" TEXT NOT NULL,
          "chatId" TEXT,
          "userId" TEXT NOT NULL,
          "role" TEXT NOT NULL,
          "content" TEXT NOT NULL,
          "model" TEXT,
          "metadata" JSONB,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
        );
      `);
      await this.prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "chat_messages_userId_idx" ON "chat_messages"("userId");`);
      await this.prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "chat_messages_chatId_idx" ON "chat_messages"("chatId");`);
      await this.prisma.$executeRawUnsafe(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_messages_chatId_fkey') THEN
            ALTER TABLE "chat_messages"
              ADD CONSTRAINT "chat_messages_chatId_fkey"
              FOREIGN KEY ("chatId") REFERENCES "ai_chats"("id")
              ON DELETE CASCADE ON UPDATE CASCADE;
          END IF;
        END $$;
      `);
      this.tablesEnsured = true;
    } catch (e: any) {
      this.logger.warn(`ensureTables failed: ${e.message}`);
    }
  }

  async listChats(userId: string) {
    await this.ensureTables();
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
    await this.ensureTables();
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
