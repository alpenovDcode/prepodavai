-- Глобальные системные настройки (maintenance-режим, фичефлаги и т.п.).
CREATE TABLE "system_settings" (
    "key" TEXT NOT NULL,
    "value" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);
