-- AlterTable: добавляем поля расписания к Lesson (M3)
ALTER TABLE "lessons"
  ADD COLUMN "scheduledAt" TIMESTAMP(3),
  ADD COLUMN "durationMinutes" INTEGER,
  ADD COLUMN "classId" TEXT,
  ADD COLUMN "notes" TEXT;

-- AddForeignKey: урок может быть привязан к классу (опционально)
ALTER TABLE "lessons"
  ADD CONSTRAINT "lessons_classId_fkey"
  FOREIGN KEY ("classId") REFERENCES "classes"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex: быстрые выборки по классу и расписанию
CREATE INDEX "lessons_classId_idx" ON "lessons"("classId");
CREATE INDEX "lessons_scheduledAt_idx" ON "lessons"("scheduledAt");
