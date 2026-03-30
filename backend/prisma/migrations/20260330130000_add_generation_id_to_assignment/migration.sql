-- AlterTable
ALTER TABLE "assignments" ADD COLUMN "generationId" TEXT;

-- CreateIndex
CREATE INDEX "assignments_generationId_idx" ON "assignments"("generationId");

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "user_generations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
