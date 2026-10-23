-- Additive repair for existing chat_messages tables created before AI chats.
ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "chatId" TEXT;
ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "model" TEXT;
CREATE INDEX IF NOT EXISTS "chat_messages_chatId_idx" ON "chat_messages"("chatId");
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chat_messages_chatId_fkey') THEN
  ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "ai_chats"("id") ON DELETE CASCADE ON UPDATE CASCADE;
 END IF;
END $$;
