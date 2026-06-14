/**
 * Локальный сид для проверки нового v2-дизайна.
 * Наполняет дашборд тестового админа (9678a4e7-...) данными:
 *  - 2 класса, 6 учеников
 *  - 3 урока, ~8 материалов, ~15 генераций за последние 14 дней
 *  - 2 задания, 2 проверенные сдачи
 *
 * Идемпотентно: повторный запуск ничего не дублирует (классы/ученики
 * матчатся по имени, генерации/материалы — по детерминированной заметке).
 *
 * Запуск:
 *   cd backend && npx ts-node scripts/seed-dev-dashboard.ts
 */
import { PrismaClient } from '@prisma/client';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

const TEACHER_ID = '9678a4e7-06bd-4e9a-adac-fd9e206343e9';
const SEED_TAG = 'seed-dev-dashboard';

const CLASSES = [
  { name: '8А — Английский', description: 'Группа подготовки к ОГЭ' },
  { name: '10Б — Английский', description: 'Профильная группа, B1+' },
];

const STUDENTS = [
  { className: '8А — Английский', name: 'Аня Соколова',  email: 'anya.s@test.local' },
  { className: '8А — Английский', name: 'Кирилл Петров', email: 'kirill.p@test.local' },
  { className: '8А — Английский', name: 'Маша Иванова',  email: 'masha.i@test.local' },
  { className: '10Б — Английский', name: 'Лев Орлов',    email: 'lev.o@test.local' },
  { className: '10Б — Английский', name: 'Полина Чен',   email: 'polina.c@test.local' },
  { className: '10Б — Английский', name: 'Дима Захаров', email: 'dima.z@test.local' },
];

const LESSONS = [
  { title: 'Past Simple vs Past Continuous', topic: 'Past Simple vs Past Continuous', grade: '8', tags: ['grammar', 'tenses'] },
  { title: 'Food & Cooking — vocabulary',     topic: 'Food & Cooking',                 grade: '8', tags: ['vocabulary'] },
  { title: 'Conditionals: 0, 1, 2',           topic: 'Conditionals 0/1/2',             grade: '10', tags: ['grammar', 'conditionals'] },
];

const GENERATION_TYPES = [
  'worksheet',
  'test',
  'vocabulary',
  'text_adaptation',
  'lesson_plan',
  'game',
  'presentation',
];

const MATERIAL_TYPES = ['worksheet', 'test', 'vocabulary', 'lesson_plan'];

function daysAgo(n: number, hour = 12) {
  // Без Date.now()/new Date() с произвольной семантикой — берём фикс. опору и сдвигаем.
  const base = new Date('2026-06-14T12:00:00Z').getTime();
  const d = new Date(base - n * 24 * 60 * 60 * 1000);
  d.setUTCHours(hour);
  return d;
}

async function ensureClasses() {
  const existing = await prisma.class.findMany({ where: { teacherId: TEACHER_ID } });
  const byName = new Map(existing.map((c) => [c.name, c]));
  const result: Record<string, string> = {};
  for (const cfg of CLASSES) {
    if (byName.has(cfg.name)) {
      result[cfg.name] = byName.get(cfg.name)!.id;
      continue;
    }
    const created = await prisma.class.create({
      data: { teacherId: TEACHER_ID, name: cfg.name, description: cfg.description },
    });
    result[cfg.name] = created.id;
    console.log(`+ class: ${cfg.name}`);
  }
  return result;
}

async function ensureStudents(classIds: Record<string, string>) {
  const classIdList = Object.values(classIds);
  const existing = await prisma.student.findMany({ where: { classId: { in: classIdList } } });
  const byName = new Set(existing.map((s) => s.name));
  const result: { id: string; name: string; classId: string }[] = existing.map((s) => ({
    id: s.id, name: s.name, classId: s.classId,
  }));
  for (const s of STUDENTS) {
    if (byName.has(s.name)) continue;
    const created = await prisma.student.create({
      data: {
        classId: classIds[s.className],
        name: s.name,
        email: s.email,
        notes: SEED_TAG,
        status: 'active',
      },
    });
    result.push({ id: created.id, name: created.name, classId: created.classId });
    console.log(`+ student: ${s.name}`);
  }
  return result;
}

async function ensureLessons(classIds: Record<string, string>) {
  const existing = await prisma.lesson.findMany({ where: { userId: TEACHER_ID } });
  const byTitle = new Map(existing.map((l) => [l.title, l]));
  const result: { id: string; title: string; classId: string | null }[] = [];
  const classKeys = Object.keys(classIds);
  for (let i = 0; i < LESSONS.length; i++) {
    const cfg = LESSONS[i];
    if (byTitle.has(cfg.title)) {
      const l = byTitle.get(cfg.title)!;
      result.push({ id: l.id, title: l.title, classId: l.classId });
      continue;
    }
    const targetClass = classIds[classKeys[i % classKeys.length]];
    const created = await prisma.lesson.create({
      data: {
        userId: TEACHER_ID,
        title: cfg.title,
        topic: cfg.topic,
        grade: cfg.grade,
        tags: cfg.tags,
        classId: targetClass,
        scheduledAt: daysAgo(-(i + 1), 14), // в ближайшие дни
        durationMinutes: 45,
      },
    });
    result.push({ id: created.id, title: created.title, classId: created.classId });
    console.log(`+ lesson: ${cfg.title}`);
  }
  return result;
}

async function ensureMaterials() {
  const existing = await prisma.material.findMany({ where: { userId: TEACHER_ID } });
  const byTitle = new Set(existing.map((m) => m.title));
  const items = [
    { title: 'Past Simple — рабочий лист', type: 'worksheet' },
    { title: 'Past Simple — тест на 10 вопросов', type: 'test' },
    { title: 'Food & Cooking — словарь', type: 'vocabulary' },
    { title: 'Conditionals — план урока', type: 'lesson_plan' },
    { title: 'Conditionals — рабочий лист', type: 'worksheet' },
    { title: 'Адаптация текста: My Favourite Dish', type: 'text_adaptation' },
    { title: 'Игра «Past Simple Match»', type: 'game' },
    { title: 'Презентация: Conditionals 0/1/2', type: 'presentation' },
  ];
  for (const it of items) {
    if (byTitle.has(it.title)) continue;
    await prisma.material.create({
      data: {
        userId: TEACHER_ID,
        title: it.title,
        type: it.type,
        content: { seed: SEED_TAG, preview: `${it.title} (тестовый контент)` },
      },
    });
    console.log(`+ material: ${it.title}`);
  }
}

async function ensureGenerations(lessons: { id: string; title: string }[]) {
  const existing = await prisma.userGeneration.findMany({
    where: { userId: TEACHER_ID, title: { startsWith: '[seed]' } },
  });
  if (existing.length >= 14) {
    console.log(`= generations already seeded (${existing.length})`);
    return;
  }
  const toCreate = 15;
  for (let i = 0; i < toCreate; i++) {
    const type = GENERATION_TYPES[i % GENERATION_TYPES.length];
    const dAgo = i % 14; // распределяем равномерно по 14 дням
    const when = daysAgo(dAgo, 9 + (i % 8));
    const lesson = lessons[i % lessons.length];
    const req = await prisma.generationRequest.create({
      data: {
        userId: TEACHER_ID,
        type,
        params: { seed: SEED_TAG, index: i },
        status: 'completed',
        result: { text: `Тестовый результат ${type} #${i}` },
        createdAt: when,
        updatedAt: when,
      },
    });
    await prisma.userGeneration.create({
      data: {
        userId: TEACHER_ID,
        generationRequestId: req.id,
        generationType: type,
        status: 'completed',
        title: `[seed] ${type} — пример #${i + 1}`,
        outputData: { text: `Тестовый результат ${type} #${i}` },
        tokensUsed: 50 + (i % 5) * 25,
        creditCost: 5 + (i % 3),
        initiatedSource: 'web',
        lessonId: lesson?.id ?? null,
        createdAt: when,
        updatedAt: when,
      },
    });
  }
  console.log(`+ generations: ${toCreate}`);
}

async function ensureAssignments(
  lessons: { id: string; title: string; classId: string | null }[],
  students: { id: string; name: string; classId: string }[],
) {
  const lesson = lessons[0];
  if (!lesson) return;
  const targetStudents = students.filter((s) => s.classId === lesson.classId).slice(0, 2);
  if (targetStudents.length === 0) return;

  for (const st of targetStudents) {
    const existing = await prisma.assignment.findFirst({
      where: { lessonId: lesson.id, studentId: st.id },
    });
    const assignment = existing
      ? existing
      : await prisma.assignment.create({
          data: {
            classId: lesson.classId,
            studentId: st.id,
            lessonId: lesson.id,
            status: 'graded',
            dueDate: daysAgo(-3, 18),
          },
        });
    if (!existing) console.log(`+ assignment for ${st.name}`);
    const hasSub = await prisma.submission.findFirst({
      where: { assignmentId: assignment.id, studentId: st.id },
    });
    if (!hasSub) {
      await prisma.submission.create({
        data: {
          assignmentId: assignment.id,
          studentId: st.id,
          content: 'Тестовое решение ученика — заполнен интерактивный воркшит.',
          grade: 4 + (targetStudents.indexOf(st) % 2),
          feedback: 'Молодец! Обрати внимание на употребление past continuous в вопросах.',
          status: 'graded',
        },
      });
      console.log(`+ submission for ${st.name}`);
    }
  }
}

async function main() {
  console.log(`Seeding dashboard data for teacher ${TEACHER_ID}…`);
  const classes = await ensureClasses();
  const students = await ensureStudents(classes);
  const lessons = await ensureLessons(classes);
  await ensureMaterials();
  await ensureGenerations(lessons);
  await ensureAssignments(lessons, students);
  console.log('Done.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
