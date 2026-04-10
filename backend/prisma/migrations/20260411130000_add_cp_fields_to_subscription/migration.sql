-- Add CloudPayments fields to user_subscriptions
ALTER TABLE "user_subscriptions" ADD COLUMN IF NOT EXISTS "cpSubscriptionId" TEXT;
ALTER TABLE "user_subscriptions" ADD COLUMN IF NOT EXISTS "cpCardToken" TEXT;
