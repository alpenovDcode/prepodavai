-- Add platform-specific chat IDs to app_users
ALTER TABLE "app_users" ADD COLUMN "telegramChatId" TEXT;
ALTER TABLE "app_users" ADD COLUMN "maxChatId" TEXT;

-- Migrate existing data: populate from legacy chatId field
UPDATE "app_users" SET "telegramChatId" = "chatId"
  WHERE "chatId" IS NOT NULL AND ("source" = 'telegram' OR "telegramId" IS NOT NULL);

UPDATE "app_users" SET "maxChatId" = "chatId"
  WHERE "chatId" IS NOT NULL AND ("source" = 'max' OR "maxId" IS NOT NULL)
    AND "telegramChatId" IS DISTINCT FROM "chatId";
