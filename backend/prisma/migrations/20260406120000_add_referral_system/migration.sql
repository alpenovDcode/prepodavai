
-- AlterTable: добавляем поле referredByCode в app_users
ALTER TABLE "app_users" ADD COLUMN "referredByCode" TEXT;

-- AlterTable: добавляем поле referredByCode в students
ALTER TABLE "students" ADD COLUMN "referredByCode" TEXT;

-- CreateTable: referral_codes
CREATE TABLE "referral_codes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userType" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "maxUsages" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable: referrals
CREATE TABLE "referrals" (
    "id" TEXT NOT NULL,
    "referralCodeId" TEXT NOT NULL,
    "referrerUserId" TEXT NOT NULL,
    "referrerType" TEXT NOT NULL,
    "referredUserId" TEXT NOT NULL,
    "referredType" TEXT NOT NULL,
    "referralType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'registered',
    "rewardGranted" BOOLEAN NOT NULL DEFAULT false,
    "conversionRewardGranted" BOOLEAN NOT NULL DEFAULT false,
    "activatedAt" TIMESTAMP(3),
    "convertedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

-- CreateTable: referral_milestones
CREATE TABLE "referral_milestones" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "milestone" TEXT NOT NULL,
    "reward" INTEGER NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "referral_codes_code_key" ON "referral_codes"("code");
CREATE INDEX "referral_codes_userId_idx" ON "referral_codes"("userId");
CREATE INDEX "referral_codes_code_idx" ON "referral_codes"("code");

-- CreateIndex
CREATE UNIQUE INDEX "referrals_referredUserId_referredType_key" ON "referrals"("referredUserId", "referredType");
CREATE INDEX "referrals_referrerUserId_idx" ON "referrals"("referrerUserId");
CREATE INDEX "referrals_referralCodeId_idx" ON "referrals"("referralCodeId");
CREATE INDEX "referrals_referralType_idx" ON "referrals"("referralType");

-- CreateIndex
CREATE UNIQUE INDEX "referral_milestones_userId_milestone_key" ON "referral_milestones"("userId", "milestone");
CREATE INDEX "referral_milestones_userId_idx" ON "referral_milestones"("userId");

-- AddForeignKey
ALTER TABLE "referral_codes" ADD CONSTRAINT "referral_codes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referralCodeId_fkey" FOREIGN KEY ("referralCodeId") REFERENCES "referral_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_milestones" ADD CONSTRAINT "referral_milestones_userId_fkey" FOREIGN KEY ("userId") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
