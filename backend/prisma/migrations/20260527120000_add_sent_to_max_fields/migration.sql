-- AlterTable
ALTER TABLE "user_generations" ADD COLUMN "sentToMax" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "user_generations" ADD COLUMN "maxSentAt" TIMESTAMP(3);
