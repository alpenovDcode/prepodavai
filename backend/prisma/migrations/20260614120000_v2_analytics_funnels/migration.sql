-- Аналитика и воронки (Funnels) v2

-- ===== AnalyticsEvent — универсальный лог событий =====
CREATE TABLE "analytics_events" (
    "id"          TEXT NOT NULL,
    "anonId"      TEXT,
    "userId"      TEXT,
    "eventType"   TEXT NOT NULL,
    "eventName"   TEXT,
    "payload"     JSONB,
    "utmSource"   TEXT,
    "utmMedium"   TEXT,
    "utmCampaign" TEXT,
    "utmContent"  TEXT,
    "utmTerm"     TEXT,
    "sessionId"   TEXT,
    "userAgent"   TEXT,
    "ipHash"      TEXT,
    "referer"     TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "analytics_events_eventType_createdAt_idx" ON "analytics_events"("eventType", "createdAt");
CREATE INDEX "analytics_events_userId_createdAt_idx"    ON "analytics_events"("userId", "createdAt");
CREATE INDEX "analytics_events_anonId_createdAt_idx"    ON "analytics_events"("anonId", "createdAt");
CREATE INDEX "analytics_events_utmSource_createdAt_idx" ON "analytics_events"("utmSource", "createdAt");

ALTER TABLE "analytics_events"
    ADD CONSTRAINT "analytics_events_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "app_users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ===== Funnel — определение воронки =====
CREATE TABLE "funnels" (
    "id"            TEXT NOT NULL,
    "name"          TEXT NOT NULL,
    "description"   TEXT,
    "ownerId"       TEXT,
    "isActive"      BOOLEAN NOT NULL DEFAULT true,
    "globalFilters" JSONB,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,
    CONSTRAINT "funnels_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "funnels_isActive_idx" ON "funnels"("isActive");

-- ===== FunnelStep — шаги воронки =====
CREATE TABLE "funnel_steps" (
    "id"             TEXT NOT NULL,
    "funnelId"       TEXT NOT NULL,
    "order"          INTEGER NOT NULL,
    "label"          TEXT NOT NULL,
    "eventType"      TEXT NOT NULL,
    "eventFilters"   JSONB,
    "isCohortAnchor" BOOLEAN NOT NULL DEFAULT false,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "funnel_steps_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "funnel_steps_funnelId_order_key" ON "funnel_steps"("funnelId", "order");
CREATE INDEX "funnel_steps_funnelId_idx" ON "funnel_steps"("funnelId");

ALTER TABLE "funnel_steps"
    ADD CONSTRAINT "funnel_steps_funnelId_fkey"
    FOREIGN KEY ("funnelId") REFERENCES "funnels"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
