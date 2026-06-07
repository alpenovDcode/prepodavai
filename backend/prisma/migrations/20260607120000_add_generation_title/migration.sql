-- Add user-editable title to generations (used by the history rename feature)
ALTER TABLE "user_generations" ADD COLUMN "title" TEXT;
