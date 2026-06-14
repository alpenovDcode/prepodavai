/**
 * Создаёт тестового веб-пользователя (учителя) для локальной разработки.
 *
 * Запуск:
 *   cd backend
 *   npx ts-node scripts/seed-test-web-user.ts
 *
 * После — войти на http://localhost:3000:
 *   email:    test@prepodavai.local
 *   password: test123
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

const TEACHER_EMAIL = 'test@prepodavai.local';
const TEACHER_PASSWORD = 'test123';
const STUDENT_EMAIL = 'student@prepodavai.local';
const STUDENT_PASSWORD = 'test123';

async function upsertTeacher() {
  const passwordHash = await bcrypt.hash(TEACHER_PASSWORD, 10);
  const apiKey = crypto.randomBytes(16).toString('hex');

  const existing = await prisma.appUser.findFirst({ where: { email: TEACHER_EMAIL } });
  if (existing) {
    return prisma.appUser.update({
      where: { id: existing.id },
      data: { passwordHash, firstName: 'Тестовый', lastName: 'Учитель' },
    });
  }
  return prisma.appUser.create({
    data: {
      email: TEACHER_EMAIL,
      passwordHash,
      firstName: 'Тестовый',
      lastName: 'Учитель',
      username: `test_teacher_${Date.now()}`,
      source: 'web',
      userHash: `web_test_${Date.now()}`,
      apiKey,
    },
  });
}

async function upsertStudent(classId: string) {
  const passwordHash = await bcrypt.hash(STUDENT_PASSWORD, 10);
  const existing = await prisma.student.findFirst({ where: { email: STUDENT_EMAIL } });
  if (existing) {
    return prisma.student.update({
      where: { id: existing.id },
      data: { passwordHash, classId, status: 'active' },
    });
  }
  return prisma.student.create({
    data: {
      classId,
      name: 'Тестовый Ученик',
      email: STUDENT_EMAIL,
      passwordHash,
      status: 'active',
    },
  });
}

async function main() {
  console.log('🌱 Создаём тестовых пользователей…\n');

  const teacher = await upsertTeacher();
  console.log(`✅ Учитель: ${TEACHER_EMAIL} / ${TEACHER_PASSWORD}`);
  console.log(`   id: ${teacher.id}\n`);

  // Подписка нужна для совместимости с legacy-кодом — кредитов даём много,
  // но в продукте всё бесплатно (см. checkCreditsAvailable).
  let plan = await prisma.subscriptionPlan.findUnique({ where: { planKey: 'business' } });
  if (!plan) {
    plan = await prisma.subscriptionPlan.create({
      data: {
        planKey: 'business',
        planName: 'Бизнес',
        monthlyCredits: 1500,
        price: 0,
        currency: 'RUB',
        allowOverage: true,
        features: ['Все функции'],
        isActive: true,
      },
    });
  }

  await prisma.userSubscription.upsert({
    where: { userId: teacher.id },
    update: { creditsBalance: 999999, status: 'active' },
    create: {
      userId: teacher.id,
      planId: plan.id,
      status: 'active',
      creditsBalance: 999999,
      extraCredits: 0,
      creditsUsed: 0,
      overageCreditsUsed: 0,
      startDate: new Date(),
      endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      autoRenew: true,
    },
  });

  // Класс
  let klass = await prisma.class.findFirst({ where: { teacherId: teacher.id, name: '10А' } });
  if (!klass) {
    klass = await prisma.class.create({
      data: { teacherId: teacher.id, name: '10А', description: 'Тестовый класс' },
    });
  }
  console.log(`📚 Класс: ${klass.name}`);

  const student = await upsertStudent(klass.id);
  console.log(`👨‍🎓 Ученик: ${STUDENT_EMAIL} / ${STUDENT_PASSWORD}`);
  console.log(`   id: ${student.id}\n`);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔑 Данные для входа:\n');
  console.log('Учитель — http://localhost:3000');
  console.log(`  Email:    ${TEACHER_EMAIL}`);
  console.log(`  Пароль:   ${TEACHER_PASSWORD}\n`);
  console.log('Ученик — http://localhost:3000/student/login');
  console.log(`  Email:    ${STUDENT_EMAIL}`);
  console.log(`  Пароль:   ${STUDENT_PASSWORD}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
