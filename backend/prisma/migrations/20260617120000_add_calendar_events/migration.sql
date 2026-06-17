-- Календарь репетитора: события + правила повторения (Phase 1)

-- CreateTable
CREATE TABLE "recurrence_rules" (
    "id" TEXT NOT NULL,
    "rrule" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recurrence_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "location" TEXT,
    "meetingUrl" TEXT,
    "studentId" TEXT,
    "classId" TEXT,
    "lessonId" TEXT,
    "subject" TEXT,
    "eventType" TEXT NOT NULL DEFAULT 'lesson',
    "format" TEXT NOT NULL DEFAULT 'online',
    "status" TEXT NOT NULL DEFAULT 'planned',
    "color" TEXT,
    "recurrenceRuleId" TEXT,
    "recurrenceExdate" TIMESTAMP(3)[] DEFAULT ARRAY[]::TIMESTAMP(3)[],
    "parentEventId" TEXT,
    "googleEventId" TEXT,
    "googleCalendarId" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "remindersSent" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "calendar_events_googleEventId_key" ON "calendar_events"("googleEventId");
CREATE INDEX "calendar_events_userId_startAt_idx" ON "calendar_events"("userId", "startAt");
CREATE INDEX "calendar_events_studentId_idx" ON "calendar_events"("studentId");
CREATE INDEX "calendar_events_classId_idx" ON "calendar_events"("classId");
CREATE INDEX "calendar_events_lessonId_idx" ON "calendar_events"("lessonId");
CREATE INDEX "calendar_events_status_idx" ON "calendar_events"("status");

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "lessons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_recurrenceRuleId_fkey" FOREIGN KEY ("recurrenceRuleId") REFERENCES "recurrence_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
