-- CreateTable
CREATE TABLE "teacher_diary_entries" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "classId" TEXT,
    "studentId" TEXT,
    "topic" TEXT,
    "goals" TEXT,
    "covered" TEXT,
    "homework" TEXT,
    "notes" TEXT,
    "recordingUrl" TEXT,
    "analysisGenerationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teacher_diary_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "teacher_diary_entries_teacherId_idx" ON "teacher_diary_entries"("teacherId");

-- CreateIndex
CREATE INDEX "teacher_diary_entries_classId_idx" ON "teacher_diary_entries"("classId");

-- CreateIndex
CREATE INDEX "teacher_diary_entries_studentId_idx" ON "teacher_diary_entries"("studentId");

-- CreateIndex
CREATE INDEX "teacher_diary_entries_date_idx" ON "teacher_diary_entries"("date");

-- AddForeignKey
ALTER TABLE "teacher_diary_entries" ADD CONSTRAINT "teacher_diary_entries_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_diary_entries" ADD CONSTRAINT "teacher_diary_entries_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_diary_entries" ADD CONSTRAINT "teacher_diary_entries_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;
