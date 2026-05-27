-- CreateTable
CREATE TABLE "bot_users" (
    "id" TEXT NOT NULL,
    "appUserId" TEXT,
    "telegramId" TEXT,
    "maxId" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "username" TEXT,
    "email" TEXT,
    "registrationStatus" TEXT NOT NULL DEFAULT 'pending',
    "source" TEXT,
    "botCredits" INTEGER NOT NULL DEFAULT 100,
    "totalGenerations" INTEGER NOT NULL DEFAULT 0,
    "generationsThisMonth" INTEGER NOT NULL DEFAULT 0,
    "lastGenerationAt" TIMESTAMP(3),
    "lastActiveAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bot_users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bot_users_appUserId_key" ON "bot_users"("appUserId");
CREATE UNIQUE INDEX "bot_users_telegramId_key" ON "bot_users"("telegramId");
CREATE UNIQUE INDEX "bot_users_maxId_key" ON "bot_users"("maxId");
CREATE INDEX "bot_users_telegramId_idx" ON "bot_users"("telegramId");
CREATE INDEX "bot_users_maxId_idx" ON "bot_users"("maxId");
CREATE INDEX "bot_users_appUserId_idx" ON "bot_users"("appUserId");

-- AddForeignKey
ALTER TABLE "bot_users" ADD CONSTRAINT "bot_users_appUserId_fkey"
    FOREIGN KEY ("appUserId") REFERENCES "app_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
