-- CreateTable
CREATE TABLE "student_invites" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "classId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "student_invites_token_key" ON "student_invites"("token");

-- CreateIndex
CREATE INDEX "student_invites_teacherId_idx" ON "student_invites"("teacherId");

-- CreateIndex
CREATE INDEX "student_invites_classId_idx" ON "student_invites"("classId");

-- AddForeignKey
ALTER TABLE "student_invites" ADD CONSTRAINT "student_invites_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_invites" ADD CONSTRAINT "student_invites_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
