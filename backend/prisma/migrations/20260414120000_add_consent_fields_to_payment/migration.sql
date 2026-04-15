-- AlterTable
ALTER TABLE "payments" ADD COLUMN "consentGivenAt" TIMESTAMP(3),
ADD COLUMN "consentIp" TEXT,
ADD COLUMN "consentUserAgent" TEXT;
