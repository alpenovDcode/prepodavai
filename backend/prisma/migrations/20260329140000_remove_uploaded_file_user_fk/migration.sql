-- AlterTable: Remove foreign key constraint on uploaded_files.userId
-- This allows both AppUser and Student to upload files

ALTER TABLE "uploaded_files" DROP CONSTRAINT IF EXISTS "uploaded_files_userId_fkey";
