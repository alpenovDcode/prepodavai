/**
 * Seed тестовых уведомлений для студента Кирилл Петров (kirill.p@test.local).
 * Запуск: cd backend && npx ts-node scripts/seed-notifications.ts
 */
import { PrismaClient } from '@prisma/client';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

async function main() {
  const student = await prisma.student.findFirst({
    where: { email: 'kirill.p@test.local' },
  });

  if (!student) {
    console.error('Студент kirill.p@test.local не найден. Сначала запустите seed-dev-dashboard.ts');
    process.exit(1);
  }

  // Очищаем старые seed-уведомления
  await prisma.notification.deleteMany({ where: { userId: student.id, userType: 'student' } });

  const now = new Date();
  const h = (hrs: number) => new Date(now.getTime() - hrs * 3_600_000);
  const d = (days: number) => new Date(now.getTime() - days * 86_400_000);

  const notifications = [
    // ── Сегодня (непрочитанные) ──────────────────────────────────────────────
    {
      userId: student.id, userType: 'student',
      type: 'deadline_reminder',
      title: 'Дедлайн сегодня в 23:59',
      message: '«Тригонометрия: формулы приведения» — рабочий лист нужно сдать до конца дня.',
      isRead: false,
      metadata: {
        teacherName: 'Евгения Александровна', teacherInitials: 'ЕА',
        subject: 'Математика', tag: 'urgent', dueDate: now.toISOString(),
      },
      createdAt: h(2),
    },
    {
      userId: student.id, userType: 'student',
      type: 'assignment_created',
      title: 'Новое задание',
      message: '«Строение клетки» — тест из 15 вопросов. Срок сдачи: 18 июня.',
      isRead: false,
      metadata: {
        teacherName: 'Игорь Петрович', teacherInitials: 'ИП',
        teacherColor: 'linear-gradient(135deg,#34D399,#059669)',
        subject: 'Биология', tag: 'new',
      },
      createdAt: h(3),
    },
    {
      userId: student.id, userType: 'student',
      type: 'submission_graded',
      title: 'Получена оценка 5',
      message: 'За эссе «Образы Андрея Болконского и Пьера Безухова». «Сильный анализ, отличные цитаты.»',
      isRead: false,
      metadata: {
        teacherName: 'Мария Константиновна', teacherInitials: 'МК',
        teacherColor: 'linear-gradient(135deg,#A78BFA,#7C3AED)',
        subject: 'Литература', grade: 5,
      },
      createdAt: h(4),
    },
    {
      userId: student.id, userType: 'student',
      type: 'achievement_unlocked',
      title: 'Новая награда — «Скоростник»!',
      message: '5 домашек подряд сданы в день получения. Так держать!',
      isRead: false,
      metadata: { xp: 150 },
      createdAt: h(5),
    },
    {
      userId: student.id, userType: 'student',
      type: 'ai_response',
      title: 'ИИ-учитель ответил',
      message: 'На ваш вопрос про производную сложной функции. С примером и пошаговым разбором.',
      isRead: false,
      metadata: {},
      createdAt: h(6),
    },

    // ── Вчера (прочитанные) ──────────────────────────────────────────────────
    {
      userId: student.id, userType: 'student',
      type: 'achievement_unlocked',
      title: '12 дней подряд!',
      message: 'Личный рекорд побит. До «Несгораемого» (14 дней) — осталось 2 дня.',
      isRead: true, metadata: {},
      createdAt: d(1),
    },
    {
      userId: student.id, userType: 'student',
      type: 'teacher_message',
      title: 'Комментарий учителя',
      message: '«Кирилл, по теме «формулы приведения» рекомендую дополнительно посмотреть видео по ссылке — пригодится перед контрольной.»',
      isRead: true,
      metadata: { teacherName: 'Евгения Александровна', teacherInitials: 'ЕА', subject: 'Математика' },
      createdAt: d(1),
    },
    {
      userId: student.id, userType: 'student',
      type: 'submission_graded',
      title: 'Получена оценка 5',
      message: 'За работу по теме «Тригонометрические уравнения». 10 из 10 заданий выполнено правильно.',
      isRead: true,
      metadata: { subject: 'Математика', grade: 5 },
      createdAt: d(1),
    },

    // ── На этой неделе ───────────────────────────────────────────────────────
    {
      userId: student.id, userType: 'student',
      type: 'assignment_created',
      title: 'Новое задание',
      message: '«Реформы Петра I» — эссе на 1–2 страницы. Срок: 20 июня.',
      isRead: true,
      metadata: {
        teacherName: 'Сергей Павлович', teacherInitials: 'СП',
        teacherColor: 'linear-gradient(135deg,#FBBF24,#D97706)',
        subject: 'История',
      },
      createdAt: d(4),
    },
    {
      userId: student.id, userType: 'student',
      type: 'submission_graded',
      title: 'Получена оценка 4',
      message: 'За лабораторную «Закон Архимеда». Хороший результат, но в задании №3 ошибка в расчётах.',
      isRead: true,
      metadata: { subject: 'Физика', grade: 4 },
      createdAt: d(5),
    },
    {
      userId: student.id, userType: 'student',
      type: 'achievement_unlocked',
      title: 'Награда — «Сотка!»',
      message: 'Прошли тест по биологии на 100% правильных ответов. Уже 3 раза в этом месяце!',
      isRead: true,
      metadata: { xp: 150 },
      createdAt: d(6),
    },
    {
      userId: student.id, userType: 'student',
      type: 'teacher_message',
      title: 'Учитель отметил вас как «Ученика недели»',
      message: '«За инициативу и активную работу на уроках. Так держать!»',
      isRead: true,
      metadata: {
        teacherName: 'Евгения Александровна', teacherInitials: 'ЕА',
        subject: 'Математика', xp: 600,
      },
      createdAt: d(7),
    },

    // ── Ранее ────────────────────────────────────────────────────────────────
    {
      userId: student.id, userType: 'student',
      type: 'teacher_message',
      title: 'Платформа обновилась',
      message: 'Добавили новую тему оформления и игру «Кто хочет стать миллионером». Зайдите в раздел «Игры» — там много нового.',
      isRead: true, metadata: {},
      createdAt: d(11),
    },
    {
      userId: student.id, userType: 'student',
      type: 'deadline_reminder',
      title: 'Контрольная через 3 дня',
      message: '«Тригонометрические функции» — материалы для подготовки уже доступны.',
      isRead: true, metadata: {},
      createdAt: d(13),
    },
  ];

  for (const n of notifications) {
    await prisma.notification.create({ data: n as any });
  }

  console.log(`✓ Создано ${notifications.length} уведомлений для студента «${student.name}» (${student.id})`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
