
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const costs = [
    {
      operationType: 'lesson_preparation',
      operationName: 'Вау-урок',
      creditCost: 10,
      description: 'Комплексная подготовка материалов для урока',
      isActive: true,
    },
    {
      operationType: 'unpacking',
      operationName: 'Распаковка Экспертности',
      creditCost: 15,
      description: 'Анализ ответов для распаковки экспертности',
      isActive: true,
    },
    {
      operationType: 'sales_advisor',
      operationName: 'ИИ-Продажник',
      creditCost: 10,
      description: 'Анализ скриншотов продаж и рекомендации',
      isActive: true,
    },
    {
      operationType: 'assistant',
      operationName: 'AI Ассистент',
      creditCost: 3,
      description: 'Чат с ИИ-помощником',
      isActive: true,
    },
    {
      operationType: 'image_generation',
      operationName: 'Генерация изображения',
      creditCost: 5,
      description: 'Создание изображений через AI',
      isActive: true,
    },
    {
      operationType: 'exam-variant',
      operationName: 'Вариант ОГЭ/ЕГЭ',
      creditCost: 5,
      description: 'Генерация вариантов ОГЭ и ЕГЭ',
      isActive: true,
    }
  ];

  console.log('Starting upsert of credit costs...');
  for (const costData of costs) {
    const result = await prisma.creditCost.upsert({
      where: { operationType: costData.operationType },
      update: costData,
      create: costData,
    });
    console.log(`Upserted: ${result.operationType} - ${result.operationName}`);
  }
  
  const allCosts = await prisma.creditCost.findMany({ where: { isActive: true } });
  console.log('\nFinal active costs in DB:');
  console.log(JSON.stringify(allCosts.map(c => ({ type: c.operationType, name: c.operationName, cost: c.creditCost })), null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
