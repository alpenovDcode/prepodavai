-- CreateTable
CREATE TABLE "tutor_market_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "avgPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "experience" INTEGER NOT NULL DEFAULT 0,
    "ratingAvg" DOUBLE PRECISION NOT NULL DEFAULT 5.0,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "dealsCompleted" INTEGER NOT NULL DEFAULT 0,
    "disabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tutor_market_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "subjectLower" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "city" TEXT,
    "description" TEXT NOT NULL,
    "studentContact" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "lockedById" TEXT,
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_dialogs" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "responderId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "trialLessonLink" TEXT,
    "trialScheduledAt" TIMESTAMP(3),
    "trialResultAt" TIMESTAMP(3),
    "paymentDeadline" TIMESTAMP(3),
    "paymentSentAt" TIMESTAMP(3),
    "paymentOverdueNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "lead_dialogs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_messages" (
    "id" TEXT NOT NULL,
    "dialogId" TEXT NOT NULL,
    "senderId" TEXT,
    "content" TEXT NOT NULL,
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "violation_reports" (
    "id" TEXT NOT NULL,
    "dialogId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "violation_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tutor_ratings" (
    "id" TEXT NOT NULL,
    "dialogId" TEXT NOT NULL,
    "raterId" TEXT NOT NULL,
    "rateeId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tutor_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tutor_market_profiles_userId_key" ON "tutor_market_profiles"("userId");

-- CreateIndex
CREATE INDEX "leads_status_subjectLower_idx" ON "leads"("status", "subjectLower");

-- CreateIndex
CREATE INDEX "leads_creatorId_idx" ON "leads"("creatorId");

-- CreateIndex
CREATE INDEX "lead_dialogs_responderId_status_idx" ON "lead_dialogs"("responderId", "status");

-- CreateIndex
CREATE INDEX "lead_dialogs_leadId_idx" ON "lead_dialogs"("leadId");

-- CreateIndex
CREATE INDEX "lead_messages_dialogId_createdAt_idx" ON "lead_messages"("dialogId", "createdAt");

-- CreateIndex
CREATE INDEX "tutor_ratings_rateeId_idx" ON "tutor_ratings"("rateeId");

-- CreateIndex
CREATE UNIQUE INDEX "tutor_ratings_dialogId_raterId_key" ON "tutor_ratings"("dialogId", "raterId");

-- AddForeignKey
ALTER TABLE "tutor_market_profiles" ADD CONSTRAINT "tutor_market_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_dialogs" ADD CONSTRAINT "lead_dialogs_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_dialogs" ADD CONSTRAINT "lead_dialogs_responderId_fkey" FOREIGN KEY ("responderId") REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_messages" ADD CONSTRAINT "lead_messages_dialogId_fkey" FOREIGN KEY ("dialogId") REFERENCES "lead_dialogs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_messages" ADD CONSTRAINT "lead_messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "app_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "violation_reports" ADD CONSTRAINT "violation_reports_dialogId_fkey" FOREIGN KEY ("dialogId") REFERENCES "lead_dialogs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "violation_reports" ADD CONSTRAINT "violation_reports_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_ratings" ADD CONSTRAINT "tutor_ratings_dialogId_fkey" FOREIGN KEY ("dialogId") REFERENCES "lead_dialogs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_ratings" ADD CONSTRAINT "tutor_ratings_raterId_fkey" FOREIGN KEY ("raterId") REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_ratings" ADD CONSTRAINT "tutor_ratings_rateeId_fkey" FOREIGN KEY ("rateeId") REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

