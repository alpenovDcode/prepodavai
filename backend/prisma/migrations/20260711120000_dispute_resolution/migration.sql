-- Аудит разрешения спора над диалогом биржи
ALTER TABLE "lead_dialogs" ADD COLUMN "disputeResolution" TEXT;
ALTER TABLE "lead_dialogs" ADD COLUMN "resolvedByAdminId" TEXT;
ALTER TABLE "lead_dialogs" ADD COLUMN "resolvedAt" TIMESTAMP(3);
ALTER TABLE "lead_dialogs" ADD COLUMN "resolutionNote" TEXT;

-- Причина/автор заморозки репетитора
ALTER TABLE "tutor_market_profiles" ADD COLUMN "disabledReason" TEXT;
ALTER TABLE "tutor_market_profiles" ADD COLUMN "disabledByAdminId" TEXT;
