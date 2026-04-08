import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  OnboardingStep,
  QUEST_STEPS_ORDER,
  STEP_META,
  QUEST_DURATION_DAYS,
} from './onboarding-quest.types';

@Injectable()
export class OnboardingQuestService {
  private readonly logger = new Logger(OnboardingQuestService.name);

  constructor(private readonly prisma: PrismaService) { }

  /**
   * Статус квеста пользователя — используется в GET /onboarding-quest/status
   */
  async getQuestStatus(userId: string) {
    const user = await this.prisma.appUser.findUnique({
      where: { id: userId },
      select: { createdAt: true },
    });

    if (!user) return null;

    const expiresAt = new Date(user.createdAt);
    expiresAt.setDate(expiresAt.getDate() + QUEST_DURATION_DAYS);
    const isExpired = new Date() > expiresAt;

    const completedRows = await this.prisma.onboardingQuestStep.findMany({
      where: { userId },
      select: { step: true, completedAt: true },
    });

    const completedSteps = completedRows.map((r) => r.step as OnboardingStep);
    const completedSet = new Set(completedSteps);

    const totalRewardEarned = completedSteps.reduce(
      (sum, s) => sum + (STEP_META[s]?.reward ?? 0),
      0,
    );

    const nextStep = QUEST_STEPS_ORDER.find((s) => !completedSet.has(s));

    const steps = QUEST_STEPS_ORDER.map((s) => ({
      ...STEP_META[s],
      completed: completedSet.has(s),
      completedAt: completedRows.find((r) => r.step === s)?.completedAt ?? null,
    }));

    return {
      isActive: !isExpired,
      isCompleted: completedSteps.length === QUEST_STEPS_ORDER.length,
      expiresAt,
      completedCount: completedSteps.length,
      totalSteps: QUEST_STEPS_ORDER.length,
      totalRewardEarned,
      steps,
      nextStep: nextStep ? STEP_META[nextStep] : null,
    };
  }

  /**
   * Завершить шаг квеста и начислить Токены.
   * Идемпотентно: повторный вызов ничего не делает.
   * Вызывается только из внутренних сервисов (не из контроллера напрямую).
   */
  async completeStep(userId: string, step: OnboardingStep): Promise<void> {
    const user = await this.prisma.appUser.findUnique({
      where: { id: userId },
      select: { createdAt: true },
    });

    if (!user) return;

    // Проверяем, не истёк ли квест
    const expiresAt = new Date(user.createdAt);
    expiresAt.setDate(expiresAt.getDate() + QUEST_DURATION_DAYS);
    if (new Date() > expiresAt) return;

    // Атомарная операция: создаём запись шага + начисляем Токены в одной транзакции
    await this.prisma.$transaction(async (tx) => {
      // createMany с skipDuplicates для идемпотентности
      const created = await tx.onboardingQuestStep.createMany({
        data: [{ userId, step }],
        skipDuplicates: true,
      });

      // created.count === 0 означает, что шаг уже был выполнен
      if (created.count === 0) return;

      const reward = STEP_META[step]?.reward ?? 0;
      if (reward <= 0) return;

      const subscription = await tx.userSubscription.findUnique({
        where: { userId },
      });

      if (!subscription) return;

      const balanceBefore = subscription.creditsBalance + subscription.extraCredits;

      await tx.userSubscription.update({
        where: { id: subscription.id },
        data: { extraCredits: { increment: reward } },
      });

      await tx.creditTransaction.create({
        data: {
          userId,
          subscriptionId: subscription.id,
          type: 'grant',
          amount: reward,
          balanceBefore,
          balanceAfter: balanceBefore + reward,
          operationType: 'onboarding_quest',
          generationRequestId: '',
          description: `Награда за квест: ${STEP_META[step].title}`,
        },
      });
    }).catch((err) => {
      // Уникальное ограничение — шаг уже выполнен, это нормально
      if (err?.code === 'P2002') return;
      this.logger.error(`Error completing quest step ${step} for user ${userId}: ${err.message}`);
    });
  }

  /**
   * Триггер: любая генерация учителя
   */
  async onTeacherGeneration(userId: string, generationType: string): Promise<void> {
    const existingSteps = await this.prisma.onboardingQuestStep.findMany({
      where: { userId },
      select: { step: true },
    });
    const completedSet = new Set(existingSteps.map((s) => s.step));

    if (!completedSet.has(OnboardingStep.FIRST_GENERATION)) {
      await this.completeStep(userId, OnboardingStep.FIRST_GENERATION);
      return; // Первое и второе не могут выполниться одновременно
    }

    if (!completedSet.has(OnboardingStep.SECOND_TYPE_GENERATION)) {
      // Проверяем, что тип отличается от типа первой генерации
      const firstGen = await this.prisma.userGeneration.findFirst({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        select: { generationType: true },
      });

      if (firstGen && firstGen.generationType !== generationType) {
        await this.completeStep(userId, OnboardingStep.SECOND_TYPE_GENERATION);
      }
    }
  }

  /**
   * Триггер: пользователь получил реферальный код (намерение поделиться)
   */
  async onReferralCodeAccessed(userId: string): Promise<void> {
    await this.completeStep(userId, OnboardingStep.SHARED_REFERRAL_LINK);
  }

  /**
   * Триггер: реферал активирован (учитель сделал первую генерацию)
   */
  async onReferralActivated(referrerUserId: string): Promise<void> {
    const existingSteps = await this.prisma.onboardingQuestStep.findMany({
      where: { userId: referrerUserId },
      select: { step: true },
    });
    const completedSet = new Set(existingSteps.map((s) => s.step));

    if (!completedSet.has(OnboardingStep.FIRST_REFERRAL_ACTIVATED)) {
      await this.completeStep(referrerUserId, OnboardingStep.FIRST_REFERRAL_ACTIVATED);
    } else if (!completedSet.has(OnboardingStep.SECOND_REFERRAL_ACTIVATED)) {
      await this.completeStep(referrerUserId, OnboardingStep.SECOND_REFERRAL_ACTIVATED);
    }
  }
}
