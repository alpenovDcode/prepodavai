-- AlterTable
ALTER TABLE "submissions" ADD COLUMN IF NOT EXISTS "formData" JSONB;
