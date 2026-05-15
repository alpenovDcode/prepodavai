-- AlterTable
ALTER TABLE "teacher_diary_entries" ADD COLUMN "aiFilledFields" TEXT[] DEFAULT ARRAY[]::TEXT[];
