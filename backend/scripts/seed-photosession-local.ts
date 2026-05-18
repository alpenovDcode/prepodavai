import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  const me = await p.appUser.findFirst({ where: { email: 'teacher@local.dev' } });
  if (!me) throw new Error('no user');
  const gr = await p.generationRequest.create({ data: { userId: me.id, type: 'photosession', status: 'completed' } });
  const ug = await p.userGeneration.create({
    data: {
      userId: me.id,
      generationType: 'photosession',
      status: 'completed',
      generationRequestId: gr.id,
      outputData: { imageUrl: 'http://localhost:3001/api/files/21c1705134544c95a654f60c2e71e52b' },
    },
  });
  console.log('reqId:', gr.id);
})().finally(() => p.$disconnect());
