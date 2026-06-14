/**
 * Тестовые данные для страницы «Материалы» (v2-дизайн).
 * Создаёт 18 генераций разных типов для admin-пользователя.
 * Идемпотентно: повторный запуск проверяет наличие по title и пропускает дубликаты.
 *
 * Запуск:
 *   cd backend && npx ts-node scripts/seed-materials.ts
 */
import { PrismaClient } from '@prisma/client';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

const TEACHER_ID = '9678a4e7-06bd-4e9a-adac-fd9e206343e9';

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

const SEED_DATA: Array<{
  generationType: string;
  title: string;
  params: Record<string, any>;
  daysAgo: number;
}> = [
  // Рабочие листы
  {
    generationType: 'worksheet',
    title: 'Тригонометрия: формулы приведения',
    params: { subject: 'Математика', topic: 'Тригонометрия', grade: '10' },
    daysAgo: 1,
  },
  {
    generationType: 'worksheet',
    title: 'Квадратные уравнения — 10 задач',
    params: { subject: 'Математика', topic: 'Алгебра', grade: '9' },
    daysAgo: 14,
  },
  {
    generationType: 'worksheet',
    title: 'Закон Ома — практические задачи',
    params: { subject: 'Физика', topic: 'Электричество', grade: '10' },
    daysAgo: 5,
  },

  // Тесты/Квизы
  {
    generationType: 'quiz',
    title: 'Строение клетки — проверочный квиз',
    params: { subject: 'Биология', topic: 'Клетка', grade: '9', numQuestions: 15 },
    daysAgo: 2,
  },
  {
    generationType: 'quiz',
    title: 'Древний Египет — входной тест',
    params: { subject: 'История', topic: 'Египет', grade: '5', numQuestions: 10 },
    daysAgo: 10,
  },
  {
    generationType: 'quiz',
    title: 'Периодическая таблица — тест по химии',
    params: { subject: 'Химия', topic: 'Периодический закон', grade: '8', numQuestions: 20 },
    daysAgo: 20,
  },

  // Презентации
  {
    generationType: 'presentation',
    title: 'Эволюция животного мира — 12 слайдов',
    params: { subject: 'Биология', topic: 'Эволюция', grade: '9', numSlides: 12 },
    daysAgo: 3,
  },
  {
    generationType: 'presentation',
    title: 'Промышленная революция — история XIX века',
    params: { subject: 'История', topic: 'Промышленная революция', grade: '9', numSlides: 15 },
    daysAgo: 30,
  },

  // Планы уроков
  {
    generationType: 'lesson-plan',
    title: 'Реформы Петра I — 45 минут',
    params: { subject: 'История', topic: 'Пётр I', grade: '8' },
    daysAgo: 4,
  },
  {
    generationType: 'lesson-plan',
    title: 'Введение в молекулярную физику',
    params: { subject: 'Физика', topic: 'Молекулярная физика', grade: '10' },
    daysAgo: 25,
  },

  // Изображения
  {
    generationType: 'image_generation',
    title: 'Карта России с обозначением субъектов',
    params: { subject: 'География', topic: 'Россия', style: 'educational poster' },
    daysAgo: 7,
  },
  {
    generationType: 'image_generation',
    title: 'Строение атома — наглядная схема',
    params: { subject: 'Химия', topic: 'Атом', style: 'diagram' },
    daysAgo: 18,
  },

  // Игры
  {
    generationType: 'game_generation',
    title: 'Древний Рим — «Кто хочет стать миллионером»',
    params: { subject: 'История', topic: 'Рим', grade: '6' },
    daysAgo: 8,
  },
  {
    generationType: 'game_generation',
    title: 'Математические термины — словарная игра',
    params: { subject: 'Математика', topic: 'Термины', grade: '7' },
    daysAgo: 45,
  },

  // Словари
  {
    generationType: 'vocabulary',
    title: 'Биологические термины — клетка и ткани',
    params: { subject: 'Биология', topic: 'Клетка', grade: '9', numWords: 20 },
    daysAgo: 6,
  },
  {
    generationType: 'vocabulary',
    title: 'Географические понятия — рельеф и климат',
    params: { subject: 'География', topic: 'Рельеф', grade: '7', numWords: 15 },
    daysAgo: 15,
  },

  // Сообщения родителям
  {
    generationType: 'message',
    title: 'Письмо родителям: итоги четверти',
    params: { subject: 'Математика', topic: 'Итоги четверти', grade: '9' },
    daysAgo: 9,
  },
  {
    generationType: 'worksheet',
    title: 'Литература: анализ стихотворения Блока',
    params: { subject: 'Литература', topic: 'Александр Блок', grade: '11' },
    daysAgo: 50,
  },
];

async function main() {
  // Получаем существующие заголовки
  const existing = await prisma.userGeneration.findMany({
    where: { userId: TEACHER_ID },
    select: { title: true },
  });
  const existingTitles = new Set(existing.map((g) => g.title).filter(Boolean));

  let created = 0;
  let skipped = 0;

  for (const item of SEED_DATA) {
    if (existingTitles.has(item.title)) {
      skipped++;
      continue;
    }

    const createdAt = daysAgo(item.daysAgo);

    // Сначала создаём GenerationRequest (обязательная связь)
    const genReq = await prisma.generationRequest.create({
      data: {
        userId: TEACHER_ID,
        type: item.generationType,
        params: item.params,
        status: 'completed',
        result: { seed: true, title: item.title },
        createdAt,
        updatedAt: createdAt,
      },
    });

    // Затем UserGeneration со ссылкой на него
    await prisma.userGeneration.create({
      data: {
        userId: TEACHER_ID,
        generationType: item.generationType,
        title: item.title,
        status: 'completed',
        inputParams: item.params,
        outputData: { seed: true, content: `Тестовый контент: ${item.title}` },
        generationRequestId: genReq.id,
        createdAt,
        updatedAt: createdAt,
      },
    });

    console.log(`+ ${item.generationType}: ${item.title}`);
    created++;
  }

  console.log(`\nГотово: создано ${created}, пропущено ${skipped}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
