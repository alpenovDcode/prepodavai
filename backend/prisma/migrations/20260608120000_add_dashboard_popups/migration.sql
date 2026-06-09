-- Всплывающие модальные окна для главной (создаются админом, показываются
-- пользователю с задержкой; повторные показы блокируются через dismissals).
CREATE TABLE "dashboard_popups" (
    "id" TEXT NOT NULL,
    "title" TEXT,
    "body" TEXT NOT NULL,
    "ctaText" TEXT,
    "ctaUrl" TEXT,
    "delaySeconds" INTEGER NOT NULL DEFAULT 5,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "dashboard_popups_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "dashboard_popups_isActive_priority_idx" ON "dashboard_popups"("isActive", "priority");

CREATE TABLE "dashboard_popup_dismissals" (
    "id" TEXT NOT NULL,
    "popupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "dashboard_popup_dismissals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "dashboard_popup_dismissals_popupId_userId_key" ON "dashboard_popup_dismissals"("popupId", "userId");
CREATE INDEX "dashboard_popup_dismissals_userId_idx" ON "dashboard_popup_dismissals"("userId");

ALTER TABLE "dashboard_popup_dismissals"
    ADD CONSTRAINT "dashboard_popup_dismissals_popupId_fkey"
    FOREIGN KEY ("popupId") REFERENCES "dashboard_popups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
