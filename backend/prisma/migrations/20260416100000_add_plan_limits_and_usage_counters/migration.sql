-- Migration: add_plan_limits_and_usage_counters
-- Добавляет лимиты учеников/классов в subscription_plans
-- и счётчики месячного использования в user_subscriptions

-- Лимиты на тарифном плане
ALTER TABLE "subscription_plans"
  ADD COLUMN IF NOT EXISTS "maxStudents"             INTEGER,
  ADD COLUMN IF NOT EXISTS "maxClasses"              INTEGER,
  ADD COLUMN IF NOT EXISTS "maxPhotosessionPerMonth" INTEGER,
  ADD COLUMN IF NOT EXISTS "maxImageGenPerMonth"     INTEGER;

-- Счётчики использования на текущую подписку
ALTER TABLE "user_subscriptions"
  ADD COLUMN IF NOT EXISTS "photosessionUsedThisMonth" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "imageGenUsedThisMonth"     INTEGER NOT NULL DEFAULT 0;

-- Устанавливаем значения для существующих тарифов
UPDATE "subscription_plans" SET
  "maxStudents" = 5,
  "maxClasses"  = 1,
  "maxPhotosessionPerMonth" = 0,
  "maxImageGenPerMonth"     = 0
WHERE "planKey" = 'free';

UPDATE "subscription_plans" SET
  "maxStudents" = 20,
  "maxClasses"  = 3,
  "maxPhotosessionPerMonth" = 0,
  "maxImageGenPerMonth"     = 0
WHERE "planKey" = 'starter';

UPDATE "subscription_plans" SET
  "maxStudents" = 50,
  "maxClasses"  = 10,
  "maxPhotosessionPerMonth" = 20,
  "maxImageGenPerMonth"     = 30
WHERE "planKey" = 'pro';

-- business: NULL = безлимит
UPDATE "subscription_plans" SET
  "maxStudents" = NULL,
  "maxClasses"  = NULL,
  "maxPhotosessionPerMonth" = 50,
  "maxImageGenPerMonth"     = 70
WHERE "planKey" = 'business';
