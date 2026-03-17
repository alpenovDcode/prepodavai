import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

export type OperationType =
  | 'text_generation'
  | 'image_generation'
  | 'photosession'
  | 'presentation'
  | 'transcription'
  | 'worksheet'
  | 'quiz'
  | 'vocabulary'
  | 'lesson_plan'
  | 'feedback'
  | 'content_adaptation'
  | 'message'
  | 'gigachat_text'
  | 'gigachat_image'
  | 'gigachat_audio'
  | 'gigachat_tts'
  | 'gigachat_stt'
  | 'gigachat_translation'
  | 'gigachat_embeddings'
  | 'gigachat_tokens_count'
  | 'game_generation'
  | 'exam_variant'
  | 'video_analysis'
  | 'sales_advisor'
  | 'unpacking';

@Injectable()
export class SubscriptionsService {
  constructor(private prisma: PrismaService) { }

  /**
   * Инициализация тарифных планов
   */
  async initializePlans() {
    const plans = [
      {
        planKey: 'starter',
        planName: 'Starter',
        monthlyCredits: 100,
        price: 0,
        currency: 'RUB',
        allowOverage: false,
        overageCostPerCredit: null,
        features: ['Базовая генерация текстов', 'Ограниченные изображения', 'История генераций'],
        isActive: true,
      },
      {
        planKey: 'pro',
        planName: 'Pro',
        monthlyCredits: 500,
        price: 990,
        currency: 'RUB',
        allowOverage: true,
        overageCostPerCredit: 2,
        features: [
          'Неограниченная генерация текстов',
          'Приоритетная обработка',
          'Больше изображений',
          'Фотосессии',
          'Презентации',
        ],
        isActive: true,
      },
      {
        planKey: 'business',
        planName: 'Business',
        monthlyCredits: 2000,
        price: 2990,
        currency: 'RUB',
        allowOverage: true,
        overageCostPerCredit: 1.5,
        features: [
          'Безлимитная генерация',
          'Максимальный приоритет',
          'Все возможности',
          'Транскрибация видео',
          'Поддержка 24/7',
        ],
        isActive: true,
      },
    ];

    for (const planData of plans) {
      await this.prisma.subscriptionPlan.upsert({
        where: { planKey: planData.planKey },
        update: planData,
        create: planData,
      });
      console.log(`✅ Subscription plan initialized: ${planData.planKey}`);
    }
  }

  /**
   * Инициализация стоимости операций
   */
  async initializeCreditCosts() {
    const costs = [
      {
        operationType: 'text_generation',
        operationName: 'Генерация текста',
        creditCost: 3,
        description: 'Стандартная генерация текста',
        isActive: true,
        isUnderMaintenance: false,
      },
      {
        operationType: 'image_generation',
        operationName: 'Генерация изображения',
        creditCost: 5,
        description: 'Создание изображений через AI',
        isActive: true,
        isUnderMaintenance: false,
      },
      {
        operationType: 'photosession',
        operationName: 'Фотосессия',
        creditCost: 10,
        description: 'AI фотосессия',
        isActive: true,
        isUnderMaintenance: false,
      },
      {
        operationType: 'presentation',
        operationName: 'Презентация',
        creditCost: 8,
        description: 'Создание презентаций',
        isActive: true,
        isUnderMaintenance: false,
      },
      {
        operationType: 'transcription',
        operationName: 'Транскрибация видео',
        creditCost: 15,
        description: 'Транскрибация видео через Whisper',
        isActive: true,
        isUnderMaintenance: false,
      },
      {
        operationType: 'worksheet',
        operationName: 'Рабочий лист',
        creditCost: 3,
        description: 'Создание рабочих листов',
        isActive: true,
        isUnderMaintenance: false,
      },
      {
        operationType: 'quiz',
        operationName: 'Тест',
        creditCost: 3,
        description: 'Создание тестов (викторин)',
        isActive: true,
        isUnderMaintenance: false,
      },
      {
        operationType: 'vocabulary',
        operationName: 'Словарь',
        creditCost: 2,
        description: 'Создание словарей',
        isActive: true,
        isUnderMaintenance: false,
      },
      {
        operationType: 'lesson_plan',
        operationName: 'План урока',
        creditCost: 3,
        description: 'Создание планов уроков',
        isActive: true,
        isUnderMaintenance: false,
      },
      {
        operationType: 'feedback',
        operationName: 'Обратная связь',
        creditCost: 2,
        description: 'Генерация обратной связи',
        isActive: true,
        isUnderMaintenance: false,
      },
      {
        operationType: 'content_adaptation',
        operationName: 'Адаптация контента',
        creditCost: 3,
        description: 'Адаптация учебного контента',
        isActive: true,
        isUnderMaintenance: false,
      },
      {
        operationType: 'message',
        operationName: 'Сообщение родителям',
        creditCost: 1,
        description: 'Генерация сообщений',
        isActive: true,
        isUnderMaintenance: false,
      },
      {
        operationType: 'gigachat_text',
        operationName: 'GigaChat текст',
        creditCost: 3,
        description: 'Прямые текстовые запросы к GigaChat',
        isActive: true,
        isUnderMaintenance: false,
      },
      {
        operationType: 'gigachat_image',
        operationName: 'GigaChat изображение',
        creditCost: 6,
        description: 'Генерация изображений через GigaChat',
        isActive: true,
        isUnderMaintenance: false,
      },
      {
        operationType: 'gigachat_tts',
        operationName: 'GigaChat синтез речи',
        creditCost: 5,
        description: 'Синтез речи из текста (TTS)',
        isActive: true,
        isUnderMaintenance: false,
      },
      {
        operationType: 'gigachat_stt',
        operationName: 'GigaChat транскрибация',
        creditCost: 5,
        description: 'Распознавание речи (STT)',
        isActive: true,
        isUnderMaintenance: false,
      },
      {
        operationType: 'gigachat_translation',
        operationName: 'GigaChat аудио перевод',
        creditCost: 7,
        description: 'Перевод аудио файлов',
        isActive: true,
        isUnderMaintenance: false,
      },
      {
        operationType: 'gigachat_embeddings',
        operationName: 'GigaChat эмбеддинги',
        creditCost: 2,
        description: 'Получение эмбеддингов через GigaChat',
        isActive: true,
        isUnderMaintenance: false,
      },
      {
        operationType: 'gigachat_tokens_count',
        operationName: 'GigaChat подсчет токенов',
        creditCost: 0,
        description: 'Подсчет токенов (бесплатно)',
        isActive: true,
        isUnderMaintenance: false,
      },
      {
        operationType: 'game_generation',
        operationName: 'Генерация игры',
        creditCost: 15,
        description: 'Создание образовательной игры',
        isActive: true,
        isUnderMaintenance: false,
      },
      {
        operationType: 'exam_variant',
        operationName: 'Вариант ОГЭ/ЕГЭ',
        creditCost: 20,
        description: 'Генерация варианта ОГЭ/ЕГЭ',
        isActive: true,
        isUnderMaintenance: false,
      },
      {
        operationType: 'unpacking',
        operationName: 'Распаковка экспертности',
        creditCost: 20,
        description: 'Распаковка экспертности',
        isActive: true,
        isUnderMaintenance: false,
      },
      {
        operationType: 'video_analysis',
        operationName: 'Анализ видео',
        creditCost: 15,
        description: 'Анализ видео через AI',
        isActive: true,
        isUnderMaintenance: false,
      },
      {
        operationType: 'sales_advisor',
        operationName: 'ИИ-продажник',
        creditCost: 10,
        description: 'ИИ-продажник для анализа продаж',
        isActive: true,
        isUnderMaintenance: false,
      },
    ];

    for (const costData of costs) {
      await this.prisma.creditCost.upsert({
        where: { operationType: costData.operationType as any },
        update: costData,
        create: costData,
      });
      console.log("✅ Credit cost initialized: " + costData.operationType);
    }
  }


  /**
   * Получить или создать подписку для пользователя
   */
  async getOrCreateUserSubscription(userId: string) {
    const existing = await this.prisma.userSubscription.findUnique({
      where: { userId },
      include: { plan: true },
    });

    if (existing) {
      return existing;
    }

    // Создаем новую подписку на бесплатный план Starter
    const starterPlan = await this.prisma.subscriptionPlan.findUnique({
      where: { planKey: 'starter' },
    });

    if (!starterPlan) {
      throw new BadRequestException(
        'Starter plan not found. Please initialize subscription plans first.',
      );
    }

    const now = new Date();
    const endDate = new Date(now);
    endDate.setMonth(endDate.getMonth() + 1);

    const subscription = await this.prisma.userSubscription.create({
      data: {
        userId,
        planId: starterPlan.id,
        status: 'active',
        creditsBalance: starterPlan.monthlyCredits,
        extraCredits: 0,
        creditsUsed: 0,
        overageCreditsUsed: 0,
        startDate: now,
        endDate,
        autoRenew: true,
      },
      include: { plan: true },
    });

    console.log(`✅ User subscription created: ${userId}, plan: starter`);

    return subscription;
  }

  /**
   * Получить стоимость операции
   */
  async getOperationCost(operationType: OperationType): Promise<number> {
    const cost = await this.prisma.creditCost.findUnique({
      where: { operationType, isActive: true },
    });

    if (!cost) {
      console.warn(`⚠️ Operation cost not found, using default: ${operationType}`);
      return 1; // Дефолтная стоимость
    }

    return cost.creditCost;
  }

  /**
   * Проверить достаточно ли кредитов
   */
  async checkCreditsAvailable(userId: string, operationType: OperationType) {
    const subscription = await this.getOrCreateUserSubscription(userId);
    const plan = subscription.plan;
    
    // Получаем полную инфу о стоимости и статусе обслуживания
    const costConfig = await this.prisma.creditCost.findUnique({
      where: { operationType: operationType as any }
    });

    if (costConfig?.isUnderMaintenance) {
      return { 
        available: false, 
        subscription, 
        plan, 
        cost: costConfig.creditCost, 
        message: 'Функция временно недоступна (технические работы)',
        isUnderMaintenance: true
      };
    }

    const cost = costConfig?.creditCost ?? 1;
    const totalAvailable = subscription.creditsBalance + subscription.extraCredits;
    const available =
      totalAvailable >= cost || (plan.allowOverage && subscription.creditsBalance >= 0);

    let message: string | undefined;
    if (!available) {
      message = `Недостаточно кредитов. Требуется: ${cost}, доступно: ${totalAvailable}`;
    }

    return { available, subscription, plan, cost, message, isUnderMaintenance: false };
  }

  /**
   * Проверить и списать кредиты
   */
  async checkAndDebitCredits(
    userId: string,
    operationType: OperationType,
    generationRequestId?: string,
  ) {
    const check = await this.checkCreditsAvailable(userId, operationType);

    if (!check.available) {
      return {
        success: false,
        error: check.message || 'Недостаточно кредитов',
      };
    }

    const debit = await this.debitCredits(userId, operationType, generationRequestId);

    if (!debit.success) {
      return {
        success: false,
        error: debit.message || 'Ошибка списания кредитов',
      };
    }

    return { success: true, transaction: debit.transaction };
  }

  /**
   * Списать кредиты за операцию
   * Использует транзакцию для предотвращения race conditions
   */
  async debitCredits(
    userId: string,
    operationType: OperationType,
    generationRequestId?: string,
    description?: string,
    customCost?: number,
  ) {
    // Используем транзакцию для атомарности операций
    return await this.prisma.$transaction(async (tx) => {
      // Повторно проверяем доступность кредитов внутри транзакции
      const subscription = await tx.userSubscription.findUnique({
        where: { userId },
        include: { plan: true },
      });

      if (!subscription || subscription.status !== 'active') {
        return { success: false, transaction: null, message: 'Подписка не активна' };
      }

      const plan = subscription.plan;
      let cost = customCost;

      if (cost === undefined) {
        const costRecord = await tx.creditCost.findUnique({
          where: { operationType },
        });

        if (!costRecord || !costRecord.isActive) {
          return {
            success: false,
            transaction: null,
            message: `Операция ${operationType} не доступна`,
          };
        }
        cost = costRecord.creditCost;
      }
      const currentBalance = subscription.creditsBalance + subscription.extraCredits;

      // Проверяем доступность кредитов с учетом овереджа
      if (!plan.allowOverage && currentBalance < cost) {
        return {
          success: false,
          transaction: null,
          message: `Недостаточно кредитов. Требуется: ${cost}, доступно: ${currentBalance}`,
        };
      }

      const balanceBefore = currentBalance;

      let newBalance = subscription.creditsBalance;
      let newExtraCredits = subscription.extraCredits;
      let newOverageCredits = subscription.overageCreditsUsed;

      // Сначала списываем с дополнительных кредитов
      if (newExtraCredits >= cost) {
        newExtraCredits -= cost;
      } else if (newExtraCredits > 0) {
        const remaining = cost - newExtraCredits;
        newExtraCredits = 0;
        // Затем с обычного баланса
        if (newBalance >= remaining) {
          newBalance -= remaining;
        } else {
          // Используем овередж (если разрешен планом)
          if (plan.allowOverage) {
            const overage = remaining - newBalance;
            newBalance = 0;
            newOverageCredits += overage;
          } else {
            return {
              success: false,
              transaction: null,
              message: 'Недостаточно кредитов и овередж не разрешен',
            };
          }
        }
      } else {
        // Списываем с обычного баланса
        if (newBalance >= cost) {
          newBalance -= cost;
        } else {
          // Используем овередж (если разрешен планом)
          if (plan.allowOverage) {
            const overage = cost - newBalance;
            newBalance = 0;
            newOverageCredits += overage;
          } else {
            return {
              success: false,
              transaction: null,
              message: 'Недостаточно кредитов и овередж не разрешен',
            };
          }
        }
      }

      // Обновляем подписку в транзакции
      const updatedSubscription = await tx.userSubscription.update({
        where: { id: subscription.id },
        data: {
          creditsBalance: newBalance,
          extraCredits: newExtraCredits,
          creditsUsed: subscription.creditsUsed + cost,
          overageCreditsUsed: newOverageCredits,
        },
      });

      // Создаем транзакцию в той же транзакции БД
      const transaction = await tx.creditTransaction.create({
        data: {
          userId,
          subscriptionId: subscription.id,
          type: 'debit',
          amount: cost,
          balanceBefore,
          balanceAfter: newBalance + newExtraCredits,
          operationType,
          generationRequestId: generationRequestId || '',
          description: description || `Списание за ${operationType}`,
          metadata: {
            plan: plan.planKey,
            overage: newOverageCredits > subscription.overageCreditsUsed,
          },
        },
      });

      console.log(
        `💳 Credits debited: userId=${userId}, operationType=${operationType}, cost=${cost}, balanceAfter=${newBalance + newExtraCredits}`,
      );

      return { success: true, transaction };
    });
  }

  /**
   * Получить информацию о подписке пользователя
   */
  async getUserSubscription(userId: string) {
    const subscription = await this.getOrCreateUserSubscription(userId);
    const plan = subscription.plan;

    return {
      success: true,
      subscription: {
        id: subscription.id,
        status: subscription.status,
        creditsBalance: subscription.creditsBalance,
        extraCredits: subscription.extraCredits,
        creditsUsed: subscription.creditsUsed,
        overageCreditsUsed: subscription.overageCreditsUsed,
        totalAvailable: subscription.creditsBalance + subscription.extraCredits,
        startDate: subscription.startDate,
        endDate: subscription.endDate,
      },
      plan: {
        planKey: plan.planKey,
        planName: plan.planName,
        monthlyCredits: plan.monthlyCredits,
        allowOverage: plan.allowOverage,
        features: plan.features,
      },
    };
  }

  /**
   * Получить список доступных тарифов
   */
  async getAvailablePlans() {
    const plans = await this.prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: { monthlyCredits: 'asc' },
    });

    return {
      success: true,
      plans: plans.map((p) => ({
        planKey: p.planKey,
        planName: p.planName,
        monthlyCredits: p.monthlyCredits,
        price: p.price,
        allowOverage: p.allowOverage,
        overageCostPerCredit: p.overageCostPerCredit,
        features: p.features,
      })),
    };
  }

  /**
   * Получить стоимость операций
   */
  async getCreditCosts() {
    const costs = await this.prisma.creditCost.findMany({
      where: { isActive: true },
      orderBy: { creditCost: 'asc' },
    });

    return {
      success: true,
      costs: costs.map((c) => ({
        operationType: c.operationType,
        operationName: c.operationName,
        creditCost: c.creditCost,
        description: c.description,
        isUnderMaintenance: c.isUnderMaintenance,
      })),
    };
  }
}
