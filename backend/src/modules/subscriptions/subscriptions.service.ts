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
  | 'game_generation'
  | 'exam_variant'
  | 'expert_unpacking'
  | 'video_analysis'
  | 'sales_advisor'
  | 'unpacking';

// Какие тарифы дают доступ к каждой операции
// free → starter → pro → business (накопительно)
export const PLAN_OPERATION_RESTRICTIONS: Record<string, string[]> = {
  // free и выше
  free: ['text_generation', 'message', 'worksheet', 'quiz', 'vocabulary', 'lesson_plan', 'feedback', 'content_adaptation'],
  // starter и выше
  starter: ['game_generation', 'exam_variant', 'expert_unpacking', 'unpacking', 'video_analysis', 'transcription', 'presentation', 'sales_advisor'],
  // pro и выше
  pro: ['image_generation', 'photosession'],
  // business — всё включено
  business: [],
};

const PLAN_ORDER = ['free', 'starter', 'pro', 'business'];

/** Проверяет, разрешена ли операция для данного planKey */
export function isOperationAllowed(planKey: string, operationType: string): boolean {
  const planIndex = PLAN_ORDER.indexOf(planKey);
  if (planIndex === -1) return true; // неизвестный план — не блокируем

  for (let i = 0; i <= planIndex; i++) {
    const tier = PLAN_ORDER[i];
    if (PLAN_OPERATION_RESTRICTIONS[tier]?.includes(operationType)) return true;
  }
  // pro и business получают всё
  return planIndex >= PLAN_ORDER.indexOf('pro');
}

@Injectable()
export class SubscriptionsService {
  constructor(private prisma: PrismaService) { }

  /**
   * Инициализация тарифных планов
   */
  async initializePlans() {
    const plans = [
      {
        planKey: 'free',
        planName: 'Бесплатный',
        monthlyCredits: 30,
        price: 0,
        currency: 'RUB',
        allowOverage: false,
        overageCostPerCredit: null,
        features: ['Рабочий лист, тест, словарь', 'Адаптация текста, план урока', 'ИИ ассистент (10 запросов/день)', 'История генераций'],
        isActive: true,
      },
      {
        planKey: 'starter',
        planName: 'Стартер',
        monthlyCredits: 200,
        price: 290,
        currency: 'RUB',
        allowOverage: false,
        overageCostPerCredit: null,
        features: ['Рабочий лист, тест, словарь', 'Игры, ОГЭ/ЕГЭ, Распаковка', 'Анализ видео, Презентации', 'ИИ ассистент (50 запросов/день)'],
        isActive: true,
      },
      {
        planKey: 'pro',
        planName: 'Про',
        monthlyCredits: 500,
        price: 690,
        currency: 'RUB',
        allowOverage: false,
        overageCostPerCredit: null,
        features: ['Всё из Стартера', 'ИИ Генератор фото', 'ИИ Фотосессия', 'ИИ ассистент (безлимит)', 'Перенос до 100 токенов'],
        isActive: true,
      },
      {
        planKey: 'business',
        planName: 'Бизнес',
        monthlyCredits: 1500,
        price: 1490,
        currency: 'RUB',
        allowOverage: true,
        overageCostPerCredit: 1.5,
        features: ['Всё из Про', 'Перенос до 300 токенов', 'Приоритетная поддержка'],
        isActive: true,
      },
    ];

    for (const planData of plans) {
      await this.prisma.subscriptionPlan.upsert({
        where: { planKey: planData.planKey },
        update: { planName: planData.planName, monthlyCredits: planData.monthlyCredits, price: planData.price, allowOverage: planData.allowOverage, overageCostPerCredit: planData.overageCostPerCredit, features: planData.features },
        create: planData,
      });
      console.log(`✅ Plan: ${planData.planKey} — ${planData.price}р / ${planData.monthlyCredits} токенов`);
    }
  }

  /**
   * Инициализация стоимости операций
   */
  async initializeCreditCosts() {
    const costs = [
      { operationType: 'text_generation', operationName: 'Генерация текста', creditCost: 1, description: 'Себест. ~1р', isActive: true, isUnderMaintenance: false },
      { operationType: 'message', operationName: 'Сообщение родителям', creditCost: 1, description: 'Себест. ~1р', isActive: true, isUnderMaintenance: false },
      { operationType: 'worksheet', operationName: 'Рабочий лист', creditCost: 3, description: 'Себест. ~1.5р', isActive: true, isUnderMaintenance: false },
      { operationType: 'quiz', operationName: 'Тест', creditCost: 3, description: 'Себест. ~1.5р', isActive: true, isUnderMaintenance: false },
      { operationType: 'vocabulary', operationName: 'Словарь', creditCost: 3, description: 'Себест. ~1.5р', isActive: true, isUnderMaintenance: false },
      { operationType: 'lesson_plan', operationName: 'План урока', creditCost: 3, description: 'Себест. ~1.5р', isActive: true, isUnderMaintenance: false },
      { operationType: 'feedback', operationName: 'Проверка ДЗ', creditCost: 3, description: 'Себест. ~1.5р', isActive: true, isUnderMaintenance: false },
      { operationType: 'content_adaptation', operationName: 'Адаптация текста', creditCost: 3, description: 'Себест. ~1.5–3р', isActive: true, isUnderMaintenance: false },
      { operationType: 'game_generation', operationName: 'Игра', creditCost: 15, description: 'Себест. ~1.5р', isActive: true, isUnderMaintenance: false },
      { operationType: 'exam_variant', operationName: 'Вариант ОГЭ/ЕГЭ', creditCost: 20, description: 'Себест. ~1.5р', isActive: true, isUnderMaintenance: false },
      { operationType: 'expert_unpacking', operationName: 'Распаковка экспертности', creditCost: 20, description: 'Себест. ~2р', isActive: true, isUnderMaintenance: false },
      { operationType: 'unpacking', operationName: 'Распаковка экспертности', creditCost: 20, description: 'Себест. ~2р', isActive: true, isUnderMaintenance: false },
      { operationType: 'video_analysis', operationName: 'Анализ видео', creditCost: 15, description: 'Себест. ~5р', isActive: true, isUnderMaintenance: false },
      { operationType: 'transcription', operationName: 'Транскрибация видео', creditCost: 15, description: 'Себест. ~5р', isActive: true, isUnderMaintenance: false },
      { operationType: 'presentation', operationName: 'Презентация', creditCost: 50, description: 'Себест. ~3–15р', isActive: true, isUnderMaintenance: false },
      { operationType: 'image_generation', operationName: 'ИИ Генератор фото', creditCost: 15, description: 'Себест. ~12р', isActive: true, isUnderMaintenance: false },
      { operationType: 'photosession', operationName: 'ИИ Фотосессия', creditCost: 25, description: 'Себест. ~18р', isActive: true, isUnderMaintenance: false },
      { operationType: 'sales_advisor', operationName: 'ИИ-продажник', creditCost: 10, description: 'Себест. ~2р', isActive: true, isUnderMaintenance: false },
    ];

    for (const costData of costs) {
      await this.prisma.creditCost.upsert({
        where: { operationType: costData.operationType as any },
        update: { operationName: costData.operationName, creditCost: costData.creditCost, description: costData.description },
        create: costData,
      });
      console.log(`✅ Cost: ${costData.operationType} — ${costData.creditCost} токенов`);
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

    // Создаем новую подписку на бесплатный план Free
    const starterPlan = await this.prisma.subscriptionPlan.findFirst({
      where: { planKey: { in: ['free', 'starter'] }, isActive: true },
      orderBy: { price: 'asc' }, // берём самый дешёвый
    });

    if (!starterPlan) {
      throw new BadRequestException(
        'Free plan not found. Please initialize subscription plans first.',
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
   * Проверить достаточно ли Токенов
   */
  async checkCreditsAvailable(userId: string, operationType: OperationType) {
    const subscription = await this.getOrCreateUserSubscription(userId);
    const plan = subscription.plan;

    // Получаем полную инфу о стоимости и статусе обслуживания
    const costConfig = await this.prisma.creditCost.findUnique({
      where: { operationType: operationType as any },
    });

    if (costConfig?.isUnderMaintenance) {
      return {
        available: false,
        subscription,
        plan,
        cost: costConfig.creditCost,
        message: 'Функция временно недоступна (технические работы)',
        isUnderMaintenance: true,
        planRestricted: false,
      };
    }

    // Проверка: разрешена ли операция на текущем тарифе
    if (!isOperationAllowed(plan.planKey, operationType)) {
      return {
        available: false,
        subscription,
        plan,
        cost: costConfig?.creditCost ?? 1,
        message: 'Эта функция недоступна на вашем тарифе. Обновите тариф.',
        isUnderMaintenance: false,
        planRestricted: true,
      };
    }

    const cost = costConfig?.creditCost ?? 1;
    const totalAvailable = subscription.creditsBalance + subscription.extraCredits;
    const available =
      totalAvailable >= cost || (plan.allowOverage && subscription.creditsBalance >= 0);

    let message: string | undefined;
    if (!available) {
      message = `Недостаточно Токенов. Требуется: ${cost}, доступно: ${totalAvailable}`;
    }

    return { available, subscription, plan, cost, message, isUnderMaintenance: false, planRestricted: false };
  }

  /**
   * Проверить и списать Токены
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
        message: check.message || 'Недостаточно Токенов',
      };
    }

    const debit = await this.debitCredits(userId, operationType, generationRequestId);

    if (!debit.success) {
      return {
        success: false,
        message: debit.message || 'Ошибка списания Токенов',
      };
    }

    return { success: true, transaction: debit.transaction };
  }

  /**
   * Списать Токены за операцию
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
      // Повторно проверяем доступность Токенов внутри транзакции
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

      // Проверяем доступность Токенов с учетом овереджа
      if (!plan.allowOverage && currentBalance < cost) {
        return {
          success: false,
          transaction: null,
          message: `Недостаточно Токенов. Требуется: ${cost}, доступно: ${currentBalance}`,
        };
      }

      const balanceBefore = currentBalance;

      let newBalance = subscription.creditsBalance;
      let newExtraCredits = subscription.extraCredits;
      let newOverageCredits = subscription.overageCreditsUsed;

      // Сначала списываем с дополнительных Токенов
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
              message: 'Недостаточно Токенов и овередж не разрешен',
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
              message: 'Недостаточно Токенов и овередж не разрешен',
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
        planKey: plan.planKey,
        planName: plan.planName,
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
   * Сменить тариф пользователя.
   * В продакшне здесь должна быть интеграция с платёжной системой.
   * Сейчас — прямое обновление (для ручного управления / тестов).
   */
  async upgradePlan(userId: string, planKey: string) {
    const plan = await this.prisma.subscriptionPlan.findUnique({ where: { planKey } });
    if (!plan || !plan.isActive) {
      throw new BadRequestException(`Тариф "${planKey}" не найден или неактивен`);
    }

    const subscription = await this.getOrCreateUserSubscription(userId);
    const currentPlanOrder = ['free', 'starter', 'pro', 'business'];
    const currentIdx = currentPlanOrder.indexOf(subscription.plan.planKey);
    const newIdx = currentPlanOrder.indexOf(planKey);

    if (newIdx <= currentIdx) {
      throw new BadRequestException('Нельзя перейти на тариф ниже текущего через этот эндпоинт');
    }

    const now = new Date();
    const endDate = new Date(now);
    endDate.setMonth(endDate.getMonth() + 1);

    // Добавляем токены нового плана поверх остатка (не обнуляем)
    const bonusCredits = plan.monthlyCredits;

    const updated = await this.prisma.userSubscription.update({
      where: { id: subscription.id },
      data: {
        planId: plan.id,
        status: 'active',
        creditsBalance: { increment: bonusCredits },
        startDate: now,
        endDate,
        autoRenew: true,
      },
      include: { plan: true },
    });

    console.log(`🔼 Plan upgraded: userId=${userId}, ${subscription.plan.planKey} → ${planKey}, +${bonusCredits} tokens`);

    return {
      success: true,
      message: `Тариф "${plan.planName}" активирован. Начислено ${bonusCredits} токенов.`,
      subscription: {
        planKey: plan.planKey,
        planName: plan.planName,
        creditsBalance: updated.creditsBalance,
        endDate: updated.endDate,
      },
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
