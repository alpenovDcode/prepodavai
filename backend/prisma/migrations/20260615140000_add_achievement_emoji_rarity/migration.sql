-- В schema.prisma у Achievement давно есть поля emoji и rarity, но миграция,
-- их добавляющая, отсутствовала. На проде это ловится падением сида:
--   "The column achievements.emoji does not exist in the current database"
-- Миграция идемпотентна — IF NOT EXISTS, можно накатывать на любую БД.

ALTER TABLE "achievements"
    ADD COLUMN IF NOT EXISTS "emoji" TEXT NOT NULL DEFAULT '🏆';

ALTER TABLE "achievements"
    ADD COLUMN IF NOT EXISTS "rarity" TEXT NOT NULL DEFAULT 'common';
