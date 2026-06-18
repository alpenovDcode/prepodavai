-- Funnel welcome config + SmartLink → Funnel relation

-- AlterTable Funnel: добавляем welcome-конфиг
ALTER TABLE "funnels" ADD COLUMN "welcomeText" TEXT;
ALTER TABLE "funnels" ADD COLUMN "welcomeButtonLabel" TEXT;
ALTER TABLE "funnels" ADD COLUMN "welcomeButtonAction" TEXT DEFAULT 'url';
ALTER TABLE "funnels" ADD COLUMN "welcomeButtonUrl" TEXT;
ALTER TABLE "funnels" ADD COLUMN "subscriptionChannelId" TEXT;
ALTER TABLE "funnels" ADD COLUMN "subscriptionChannelName" TEXT;
ALTER TABLE "funnels" ADD COLUMN "subscriptionPromptText" TEXT;
ALTER TABLE "funnels" ADD COLUMN "subscriptionSuccessText" TEXT;

-- AlterTable SmartLink: привязка к воронке
ALTER TABLE "smart_links" ADD COLUMN "funnelId" TEXT;

-- CreateIndex
CREATE INDEX "smart_links_funnelId_idx" ON "smart_links"("funnelId");

-- AddForeignKey
ALTER TABLE "smart_links" ADD CONSTRAINT "smart_links_funnelId_fkey"
  FOREIGN KEY ("funnelId") REFERENCES "funnels"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
