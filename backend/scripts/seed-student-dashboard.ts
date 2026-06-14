/**
 * Seed: тестовые данные для страницы ученика /student/dashboard.
 * Создаёт ученика «Кирилл Петров» с паролем, а также набор разнотипных заданий
 * (срочные, на неделе, на проверке, завершённые, просроченные).
 *
 * Credentials:
 *   email: kirill.p@test.local
 *   password: kirill123
 *
 * Запуск:
 *   cd backend && npx ts-node scripts/seed-student-dashboard.ts
 */
import { PrismaClient } from '@prisma/client';
import * as path from 'path';
import * as dotenv from 'dotenv';
import * as bcrypt from 'bcryptjs';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

const TEACHER_ID = '9678a4e7-06bd-4e9a-adac-fd9e206343e9';
const STUDENT_EMAIL = 'kirill.p@test.local';
const STUDENT_PASSWORD = 'kirill123';
const STUDENT_NAME = 'Кирилл Петров';

function daysFromNow(n: number, hour = 23): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(hour, 59, 0, 0);
  return d;
}

async function ensureClass(): Promise<string> {
  let cls = await prisma.class.findFirst({ where: { teacherId: TEACHER_ID, name: '8А — Английский' } });
  if (!cls) {
    cls = await prisma.class.create({
      data: { teacherId: TEACHER_ID, name: '8А — Английский', description: 'Группа подготовки к ОГЭ' },
    });
    console.log('+ class 8А — Английский');
  }
  return cls.id;
}

async function ensureStudent(classId: string): Promise<string> {
  let student = await prisma.student.findFirst({ where: { email: STUDENT_EMAIL } });
  const passwordHash = await bcrypt.hash(STUDENT_PASSWORD, 10);

  if (!student) {
    student = await prisma.student.create({
      data: { classId, name: STUDENT_NAME, email: STUDENT_EMAIL, status: 'active' },
    });
    console.log(`+ student: ${STUDENT_NAME}`);
  } else {
    console.log(`= student exists: ${STUDENT_NAME} (${student.id})`);
  }

  // Обновляем пароль напрямую
  await prisma.$executeRaw`UPDATE students SET "passwordHash" = ${passwordHash}, "classId" = ${classId} WHERE id = ${student.id}`;
  console.log(`  password set for ${STUDENT_EMAIL}`);
  return student.id;
}

const LESSONS_SPEC = [
  { title: 'Тригонометрия: формулы приведения', topic: 'Тригонометрия', type: 'worksheet', dueOffset: 1 },
  { title: 'Дискриминант квадратного уравнения', topic: 'Алгебра', type: 'quiz', dueOffset: 1 },
  { title: 'Игра «Миллионер»: тригонометрия', topic: 'Тригонометрия', type: 'game', dueOffset: 4 },
  { title: 'Электромагнитная индукция', topic: 'Физика', type: 'presentation', dueOffset: 4 },
  { title: 'Past Continuous Tense', topic: 'Английский язык', type: 'quiz', dueOffset: 6 },
  { title: 'Древний Рим', topic: 'История', type: 'worksheet', dueOffset: 3, submitted: true },
  { title: 'Строение клетки', topic: 'Биология', type: 'test', dueOffset: -3, graded: true, grade: 5 },
  { title: 'Тригонометрия: углы и функции', topic: 'Тригонометрия', type: 'worksheet', dueOffset: -2, overdue: true },
];

async function ensureLessonsAndAssignments(studentId: string, classId: string) {
  for (const spec of LESSONS_SPEC) {
    // Lesson
    let lesson = await prisma.lesson.findFirst({
      where: { userId: TEACHER_ID, title: spec.title },
    });
    if (!lesson) {
      lesson = await prisma.lesson.create({
        data: {
          userId: TEACHER_ID,
          classId,
          title: spec.title,
          topic: spec.topic,
          grade: '9',
          tags: [spec.type],
          durationMinutes: 45,
        },
      });
      console.log(`+ lesson: ${spec.title}`);

      // Generation so the icon shows the correct type
      const req = await prisma.generationRequest.create({
        data: {
          userId: TEACHER_ID,
          type: spec.type,
          params: { seed: 'seed-student-dashboard' },
          status: 'completed',
          result: {},
        },
      });
      await prisma.userGeneration.create({
        data: {
          userId: TEACHER_ID,
          lessonId: lesson.id,
          generationRequestId: req.id,
          generationType: spec.type,
          status: 'completed',
          title: `[seed] ${spec.type} — ${spec.title}`,
          outputData: { text: `Тестовый контент — ${spec.title}` },
          tokensUsed: 0,
          creditCost: 0,
          initiatedSource: 'seed',
        },
      });
    }

    // Assignment
    let assignment = await prisma.assignment.findFirst({
      where: { lessonId: lesson.id, studentId },
    });
    if (!assignment) {
      const due = daysFromNow(spec.dueOffset);
      assignment = await prisma.assignment.create({
        data: {
          lessonId: lesson.id,
          classId,
          studentId,
          dueDate: due,
          status: spec.graded ? 'graded' : spec.submitted ? 'submitted' : 'assigned',
        },
      });
      console.log(`+ assignment: ${spec.title}`);

      if (spec.submitted || spec.graded) {
        await prisma.submission.create({
          data: {
            assignmentId: assignment.id,
            studentId,
            content: 'Тестовый ответ ученика.',
            status: spec.graded ? 'graded' : 'submitted',
            ...(spec.graded ? { grade: spec.grade ?? 4, feedback: 'Хорошая работа!' } : {}),
          },
        });
        console.log(`  + submission for ${spec.title}`);
      }
    } else {
      console.log(`= assignment exists: ${spec.title}`);
    }
  }
}

async function main() {
  console.log('Seeding student dashboard data…');
  const classId = await ensureClass();
  const studentId = await ensureStudent(classId);
  await ensureLessonsAndAssignments(studentId, classId);
  console.log('\nDone.');
  console.log(`\nCredentials:`);
  console.log(`  email:    ${STUDENT_EMAIL}`);
  console.log(`  password: ${STUDENT_PASSWORD}`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
