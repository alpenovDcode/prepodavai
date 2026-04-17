-- AlterTable
ALTER TABLE "utm_links" ADD COLUMN "bonusTokens" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "utm_links" ADD COLUMN "linkTtl" TEXT NOT NULL DEFAULT 'always';
