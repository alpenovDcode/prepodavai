-- Геймификация v2: streak, XP, level, achievements, XP audit log
-- Эта миграция написана вручную (создавалась без живой БД).

-- ===== StudentGamification =====
CREATE TABLE "student_gamification" (
    "id"              TEXT NOT NULL,
    "studentId"       TEXT NOT NULL,
    "xp"              INTEGER NOT NULL DEFAULT 0,
    "level"           INTEGER NOT NULL DEFAULT 1,
    "streakDays"      INTEGER NOT NULL DEFAULT 0,
    "bestStreakDays"  INTEGER NOT NULL DEFAULT 0,
    "lastActiveDate"  TIMESTAMP(3),
    "submittedCount"  INTEGER NOT NULL DEFAULT 0,
    "gradedCount"     INTEGER NOT NULL DEFAULT 0,
    "perfectCount"    INTEGER NOT NULL DEFAULT 0,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,
    CONSTRAINT "student_gamification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "student_gamification_studentId_key" ON "student_gamification"("studentId");

ALTER TABLE "student_gamification"
    ADD CONSTRAINT "student_gamification_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "students"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ===== Achievement (каталог) =====
CREATE TABLE "achievements" (
    "key"            TEXT NOT NULL,
    "title"          TEXT NOT NULL,
    "description"    TEXT NOT NULL,
    "category"       TEXT NOT NULL DEFAULT 'general',
    "conditionField" TEXT NOT NULL,
    "conditionValue" INTEGER NOT NULL,
    "xpReward"       INTEGER NOT NULL DEFAULT 50,
    "iconKey"        TEXT NOT NULL DEFAULT 'trophy',
    "color"          TEXT NOT NULL DEFAULT 'brand',
    "sortOrder"      INTEGER NOT NULL DEFAULT 0,
    "isActive"       BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "achievements_pkey" PRIMARY KEY ("key")
);

-- ===== StudentAchievement (разблокированные у конкретного ученика) =====
CREATE TABLE "student_achievements" (
    "id"             TEXT NOT NULL,
    "studentId"      TEXT NOT NULL,
    "achievementKey" TEXT NOT NULL,
    "unlockedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "student_achievements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "student_achievements_studentId_achievementKey_key"
    ON "student_achievements"("studentId", "achievementKey");

CREATE INDEX "student_achievements_studentId_idx" ON "student_achievements"("studentId");

ALTER TABLE "student_achievements"
    ADD CONSTRAINT "student_achievements_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "students"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "student_achievements"
    ADD CONSTRAINT "student_achievements_achievementKey_fkey"
    FOREIGN KEY ("achievementKey") REFERENCES "achievements"("key")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ===== XpEvent (аудит начисления опыта) =====
CREATE TABLE "xp_events" (
    "id"        TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "amount"    INTEGER NOT NULL,
    "reason"    TEXT NOT NULL,
    "metadata"  JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "xp_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "xp_events_studentId_idx" ON "xp_events"("studentId");
CREATE INDEX "xp_events_createdAt_idx" ON "xp_events"("createdAt");

ALTER TABLE "xp_events"
    ADD CONSTRAINT "xp_events_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "students"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
