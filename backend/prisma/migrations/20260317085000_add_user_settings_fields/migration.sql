-- AlterTable
ALTER TABLE "app_users" ADD COLUMN     "avatar" TEXT,
ADD COLUMN     "bio" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "notifyNewCourse" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyStudentProgress" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "notifyWeeklyReport" BOOLEAN NOT NULL DEFAULT true;
