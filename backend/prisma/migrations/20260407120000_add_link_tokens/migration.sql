-- CreateTable: токены привязки Telegram/Max к web-аккаунту
CREATE TABLE "link_tokens" (
    "id"          TEXT NOT NULL,
    "token"       TEXT NOT NULL,
    "userId"      TEXT NOT NULL,
    "platform"    TEXT NOT NULL,
    "status"      TEXT NOT NULL DEFAULT 'pending',
    "linkedId"    TEXT,
    "linkedName"  TEXT,
    "expiresAt"   TIMESTAMP(3) NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "link_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "link_tokens_token_key" ON "link_tokens"("token");
CREATE INDEX "link_tokens_token_idx"  ON "link_tokens"("token");
CREATE INDEX "link_tokens_userId_idx" ON "link_tokens"("userId");

-- AddForeignKey
ALTER TABLE "link_tokens"
    ADD CONSTRAINT "link_tokens_userId_fkey"
    FOREIGN KEY ("userId")
    REFERENCES "app_users"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;
