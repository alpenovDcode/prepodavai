import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  const me = await p.appUser.findFirst({ where: { email: 'teacher@local.dev' } });
  if (!me) throw new Error('user not found');
  const gr = await p.generationRequest.create({ data: { userId: me.id, type: 'photosession', status: 'completed' } });
  const ug = await p.userGeneration.create({
    data: {
      userId: me.id,
      generationType: 'photosession',
      status: 'completed',
      generationRequestId: gr.id,
      // Публичная картинка JPEG, имитируем replicate.delivery
      outputData: { imageUrl: 'https://httpbin.org/image/jpeg' },
    },
  });
  console.log('reqId:', gr.id);
  console.log('userGenId:', ug.id);
})().finally(() => p.$disconnect());
