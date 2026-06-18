-- CreateTable
CREATE TABLE "smart_links" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetUrl" TEXT NOT NULL,
    "description" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmContent" TEXT,
    "utmTerm" TEXT,
    "autoTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "uniqueClicks" INTEGER NOT NULL DEFAULT 0,
    "registrations" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "smart_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "smart_links_slug_key" ON "smart_links"("slug");

-- CreateTable
CREATE TABLE "smart_link_clicks" (
    "id" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "userId" TEXT,
    "anonId" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "referer" TEXT,
    "country" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "smart_link_clicks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "smart_link_clicks_linkId_createdAt_idx" ON "smart_link_clicks"("linkId", "createdAt");

-- CreateIndex
CREATE INDEX "smart_link_clicks_userId_idx" ON "smart_link_clicks"("userId");

-- CreateIndex
CREATE INDEX "smart_link_clicks_anonId_idx" ON "smart_link_clicks"("anonId");

-- AddForeignKey
ALTER TABLE "smart_link_clicks" ADD CONSTRAINT "smart_link_clicks_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "smart_links"("id") ON DELETE CASCADE ON UPDATE CASCADE;
