import { PrismaClient } from '@prisma/client';
async function test() {
  const prisma = new PrismaClient();
  const id = '9f1e24b8-5f2c-42d0-a1a5-e7dfafcfa889';
  const appUser = await prisma.appUser.findUnique({ where: { id }});
  const student = await prisma.student.findUnique({ where: { id }});
  console.log('AppUser:', appUser ? 'Exists' : 'Not found');
  console.log('Student:', student ? 'Exists' : 'Not found');
  await prisma.$disconnect();
}
test().catch(console.error);
