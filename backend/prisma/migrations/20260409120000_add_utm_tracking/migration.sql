-- AddColumn UTM fields to app_users
ALTER TABLE "app_users" ADD COLUMN IF NOT EXISTS "utmSource"      TEXT;
ALTER TABLE "app_users" ADD COLUMN IF NOT EXISTS "utmMedium"      TEXT;
ALTER TABLE "app_users" ADD COLUMN IF NOT EXISTS "utmCampaign"    TEXT;
ALTER TABLE "app_users" ADD COLUMN IF NOT EXISTS "utmContent"     TEXT;
ALTER TABLE "app_users" ADD COLUMN IF NOT EXISTS "utmTerm"        TEXT;
ALTER TABLE "app_users" ADD COLUMN IF NOT EXISTS "utmLandingPage" TEXT;
ALTER TABLE "app_users" ADD COLUMN IF NOT EXISTS "utmLinkId"      TEXT;

-- Indexes
CREATE INDEX IF NOT EXISTS "app_users_utmSource_idx"   ON "app_users"("utmSource");
CREATE INDEX IF NOT EXISTS "app_users_utmCampaign_idx" ON "app_users"("utmCampaign");
CREATE INDEX IF NOT EXISTS "app_users_utmLinkId_idx"   ON "app_users"("utmLinkId");

-- CreateTable utm_links
CREATE TABLE IF NOT EXISTS "utm_links" (
    "id"            TEXT NOT NULL,
    "name"          TEXT NOT NULL,
    "socialNetwork" TEXT NOT NULL,
    "utmSource"     TEXT NOT NULL,
    "utmMedium"     TEXT NOT NULL,
    "utmCampaign"   TEXT NOT NULL,
    "utmContent"    TEXT,
    "utmTerm"       TEXT,
    "baseUrl"       TEXT NOT NULL DEFAULT 'https://prepodavai.ru',
    "fullUrl"       TEXT NOT NULL,
    "clicks"        INTEGER NOT NULL DEFAULT 0,
    "registrations" INTEGER NOT NULL DEFAULT 0,
    "isActive"      BOOLEAN NOT NULL DEFAULT true,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "utm_links_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "utm_links_socialNetwork_idx" ON "utm_links"("socialNetwork");
CREATE INDEX IF NOT EXISTS "utm_links_utmCampaign_idx"   ON "utm_links"("utmCampaign");
