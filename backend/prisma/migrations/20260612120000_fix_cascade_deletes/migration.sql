-- Fix cascade deletes for Assignment and Submission
-- Allows deleting a student, class, or assignment without FK constraint errors

-- Assignment → Student: при удалении ученика удалить его личные задания
ALTER TABLE "assignments" DROP CONSTRAINT IF EXISTS "assignments_studentId_fkey";
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Assignment → Class: при удалении класса удалить его задания
ALTER TABLE "assignments" DROP CONSTRAINT IF EXISTS "assignments_classId_fkey";
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_classId_fkey"
  FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Submission → Assignment: при удалении задания удалить все работы по нему
ALTER TABLE "submissions" DROP CONSTRAINT IF EXISTS "submissions_assignmentId_fkey";
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_assignmentId_fkey"
  FOREIGN KEY ("assignmentId") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Submission → Student: при удалении ученика удалить все его работы
ALTER TABLE "submissions" DROP CONSTRAINT IF EXISTS "submissions_studentId_fkey";
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
