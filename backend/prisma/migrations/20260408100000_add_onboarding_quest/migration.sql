-- CreateTable
CREATE TABLE "onboarding_quest_steps" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "step" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "onboarding_quest_steps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "onboarding_quest_steps_userId_idx" ON "onboarding_quest_steps"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_quest_steps_userId_step_key" ON "onboarding_quest_steps"("userId", "step");

-- AddForeignKey
ALTER TABLE "onboarding_quest_steps" ADD CONSTRAINT "onboarding_quest_steps_userId_fkey" FOREIGN KEY ("userId") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
