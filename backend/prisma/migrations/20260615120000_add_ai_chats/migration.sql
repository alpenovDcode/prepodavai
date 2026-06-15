-- Чаты ИИ-учителя (для учителя и ученика). Модель была в schema.prisma,
-- но миграция отсутствовала — на проде таблиц не было, /api/ai-chats падал 500.

CREATE TABLE "ai_chats" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Новый диалог',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_chats_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_chats_userId_idx" ON "ai_chats"("userId");

CREATE TABLE "chat_messages" (
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

CREATE INDEX "chat_messages_userId_idx" ON "chat_messages"("userId");
CREATE INDEX "chat_messages_chatId_idx" ON "chat_messages"("chatId");

ALTER TABLE "chat_messages"
    ADD CONSTRAINT "chat_messages_chatId_fkey"
    FOREIGN KEY ("chatId") REFERENCES "ai_chats"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
