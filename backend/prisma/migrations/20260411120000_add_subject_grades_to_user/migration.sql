-- AlterTable
ALTER TABLE "app_users" ADD COLUMN IF NOT EXISTS "subject" TEXT;
ALTER TABLE "app_users" ADD COLUMN IF NOT EXISTS "grades" TEXT;
