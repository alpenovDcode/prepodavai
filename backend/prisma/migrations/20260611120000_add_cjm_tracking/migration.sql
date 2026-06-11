-- Add initiatedSource to user_generations
ALTER TABLE "user_generations" ADD COLUMN IF NOT EXISTS "initiatedSource" TEXT;

-- Add UTM/deep-link fields to bot_users
ALTER TABLE "bot_users" ADD COLUMN IF NOT EXISTS "startPayload" TEXT;
ALTER TABLE "bot_users" ADD COLUMN IF NOT EXISTS "utmSource" TEXT;
ALTER TABLE "bot_users" ADD COLUMN IF NOT EXISTS "utmMedium" TEXT;
ALTER TABLE "bot_users" ADD COLUMN IF NOT EXISTS "utmCampaign" TEXT;

-- Create bot_credit_transactions table
CREATE TABLE IF NOT EXISTS "bot_credit_transactions" (
    "id" TEXT NOT NULL,
    "botUserId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "balanceBefore" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "generationType" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bot_credit_transactions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "bot_credit_transactions_botUserId_idx" ON "bot_credit_transactions"("botUserId");
CREATE INDEX IF NOT EXISTS "bot_credit_transactions_createdAt_idx" ON "bot_credit_transactions"("createdAt");

ALTER TABLE "bot_credit_transactions"
    ADD CONSTRAINT "bot_credit_transactions_botUserId_fkey"
    FOREIGN KEY ("botUserId") REFERENCES "bot_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
