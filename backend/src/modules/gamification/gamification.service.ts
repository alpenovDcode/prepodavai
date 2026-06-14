import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Шкала уровней. XP_TO_NEXT_LEVEL(level) — сколько накопленного XP нужно для перехода на level+1.
 * Простая прогрессия: levelN требует N*500 XP.
 *   level 1 → 0 XP
 *   level 2 → 500
 *   level 3 → 1500
 *   level 4 → 3000
 *   ...
 */
function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  // сумма арифметической прогрессии: 500 + 1000 + ... = 500 * n*(n-1)/2 для перехода на level n+1
  return (500 * (level - 1) * level) / 2;
}

function levelFromXp(xp: number): number {
  let lvl = 1;
  while (xpForLevel(lvl + 1) <= xp) lvl++;
  return lvl;
}

/** Начало UTC-дня — нормализация даты. */
function startOfUtcDay(d: Date = new Date()): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

function daysBetween(a: Date, b: Date): number {
  const ms = startOfUtcDay(b).getTime() - startOfUtcDay(a).getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

export interface AwardXpInput {
  studentId: string;
  amount: number;
  reason: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class GamificationService {
  private readonly logger = new Logger(GamificationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Получить или создать запись StudentGamification.
   */
  private async ensure(studentId: string) {
    let g = await this.prisma.studentGamification.findUnique({ where: { studentId } });
    if (!g) {
      g = await this.prisma.studentGamification.create({
        data: { studentId },
      });
    }
    return g;
  }

  /**
   * Полная сводка для UI: уровень, опыт, стрик, ачивки, прогресс к ачивкам.
   * Используется на /student/dashboard и /student/achievements.
   */
  async getProgress(studentId: string) {
    const student = await this.prisma.student.findUnique({ where: { id: studentId } });
    if (!student) throw new NotFoundException('Ученик не найден');

    const g = await this.ensure(studentId);
    const unlocked = await this.prisma.studentAchievement.findMany({
      where: { studentId },
      include: { achievement: true },
      orderBy: { unlockedAt: 'desc' },
    });
    const catalog = await this.prisma.achievement.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });

    const unlockedKeys = new Set(unlocked.map((u) => u.achievementKey));
    const level = levelFromXp(g.xp);
    const nextLevelAt = xpForLevel(level + 1);
    const currentLevelAt = xpForLevel(level);

    return {
      studentId,
      name: student.name,
      xp: g.xp,
      level,
      nextLevelXp: nextLevelAt,
      currentLevelStartXp: currentLevelAt,
      progressToNextLevel: nextLevelAt > currentLevelAt
        ? Math.min(100, Math.round(((g.xp - currentLevelAt) / (nextLevelAt - currentLevelAt)) * 100))
        : 100,
      streakDays: g.streakDays,
      bestStreakDays: g.bestStreakDays,
      lastActiveDate: g.lastActiveDate,
      counts: {
        submitted: g.submittedCount,
        graded: g.gradedCount,
        perfect: g.perfectCount,
      },
      achievements: catalog.map((a) => {
        const isUnlocked = unlockedKeys.has(a.key);
        const progress =
          a.conditionField === 'submittedCount' ? g.submittedCount
          : a.conditionField === 'streakDays'     ? g.streakDays
          : a.conditionField === 'gradedCount'    ? g.gradedCount
          : a.conditionField === 'perfectCount'   ? g.perfectCount
          : 0;
        return {
          key: a.key,
          title: a.title,
          description: a.description,
          category: a.category,
          iconKey: a.iconKey,
          color: a.color,
          xpReward: a.xpReward,
          target: a.conditionValue,
          progress,
          unlocked: isUnlocked,
          unlockedAt: unlocked.find((u) => u.achievementKey === a.key)?.unlockedAt ?? null,
        };
      }),
    };
  }

  /**
   * «Чек-ин» — отметить, что ученик заходил сегодня.
   * Обновляет streak:
   *   — если последний день = вчера → streakDays++
   *   — если ровно сегодня → no-op
   *   — иначе → reset на 1
   * Возвращает обновлённый progress.
   */
  async checkIn(studentId: string) {
    const g = await this.ensure(studentId);
    const today = startOfUtcDay();
    const last = g.lastActiveDate ? startOfUtcDay(g.lastActiveDate) : null;

    let streak = g.streakDays;
    let xpBonus = 0;
    let milestoneReached: number | null = null;

    if (!last) {
      streak = 1;
      xpBonus = 5;
    } else {
      const diff = daysBetween(last, today);
      if (diff === 0) {
        // уже отметились сегодня — ничего не делаем
      } else if (diff === 1) {
        streak = g.streakDays + 1;
        xpBonus = 10;
        // milestone-бонусы за круглые числа
        if (streak === 3 || streak === 7 || streak === 14 || streak === 30 || streak === 100) {
          milestoneReached = streak;
          xpBonus += streak * 5;
        }
      } else {
        // пропустили день — стрик сбрасывается
        streak = 1;
        xpBonus = 5;
      }
    }

    const bestStreak = Math.max(g.bestStreakDays, streak);

    await this.prisma.studentGamification.update({
      where: { studentId },
      data: {
        streakDays: streak,
        bestStreakDays: bestStreak,
        lastActiveDate: today,
      },
    });

    if (xpBonus > 0) {
      await this.awardXp({
        studentId,
        amount: xpBonus,
        reason: milestoneReached ? `streak_milestone_${milestoneReached}` : 'daily_checkin',
        metadata: { streak, milestone: milestoneReached },
      });
    }

    await this.checkAndUnlockAchievements(studentId);
    return this.getProgress(studentId);
  }

  /**
   * Начислить опыт. Создаёт XpEvent, обновляет xp+level.
   * Не запускает caвтоматическую проверку ачивок (см. checkAndUnlockAchievements отдельно).
   */
  async awardXp(input: AwardXpInput) {
    const { studentId, amount, reason, metadata } = input;
    if (amount === 0) return;
    await this.ensure(studentId);

    const g = await this.prisma.studentGamification.update({
      where: { studentId },
      data: {
        xp: { increment: amount },
      },
    });

    const newLevel = levelFromXp(g.xp);
    if (newLevel !== g.level) {
      await this.prisma.studentGamification.update({
        where: { studentId },
        data: { level: newLevel },
      });
    }

    await this.prisma.xpEvent.create({
      data: { studentId, amount, reason, metadata: (metadata ?? null) as any },
    });

    this.logger.log(`Student ${studentId}: +${amount} XP (${reason}). Total: ${g.xp}, level ${newLevel}`);
  }

  /**
   * Инкремент счётчиков submitted/graded/perfect.
   * Вызывается из submissions.service при создании/проверке работы.
   */
  async bumpCounter(studentId: string, field: 'submittedCount' | 'gradedCount' | 'perfectCount') {
    await this.ensure(studentId);
    await this.prisma.studentGamification.update({
      where: { studentId },
      data: { [field]: { increment: 1 } } as any,
    });
  }

  /**
   * Проверить все ачивки и разблокировать те, чьи условия выполнены.
   * Идемпотентно — повторный вызов не создаёт дубликатов.
   * Возвращает массив только что разблокированных ачивок.
   */
  async checkAndUnlockAchievements(studentId: string) {
    const g = await this.ensure(studentId);
    const catalog = await this.prisma.achievement.findMany({ where: { isActive: true } });
    const already = await this.prisma.studentAchievement.findMany({
      where: { studentId },
      select: { achievementKey: true },
    });
    const alreadySet = new Set(already.map((a) => a.achievementKey));

    const newlyUnlocked: typeof catalog = [];

    for (const a of catalog) {
      if (alreadySet.has(a.key)) continue;

      const actual =
        a.conditionField === 'submittedCount' ? g.submittedCount
        : a.conditionField === 'streakDays'     ? g.streakDays
        : a.conditionField === 'gradedCount'    ? g.gradedCount
        : a.conditionField === 'perfectCount'   ? g.perfectCount
        : 0;

      if (actual >= a.conditionValue) {
        await this.prisma.studentAchievement.create({
          data: { studentId, achievementKey: a.key },
        });
        if (a.xpReward > 0) {
          await this.awardXp({
            studentId,
            amount: a.xpReward,
            reason: 'achievement_unlock',
            metadata: { achievementKey: a.key, title: a.title },
          });
        }
        newlyUnlocked.push(a);
        this.logger.log(`Student ${studentId} unlocked achievement: ${a.key} (${a.title}) +${a.xpReward} XP`);
      }
    }

    return newlyUnlocked;
  }

  /**
   * Высокоуровневый хук: ученик создал submission.
   * Начисляет XP, увеличивает счётчик, проверяет ачивки.
   */
  async onSubmissionCreated(studentId: string, submissionId: string) {
    await this.bumpCounter(studentId, 'submittedCount');
    await this.awardXp({
      studentId,
      amount: 20,
      reason: 'submission_created',
      metadata: { submissionId },
    });
    return this.checkAndUnlockAchievements(studentId);
  }

  /**
   * Хук: ученика оценили (учитель проставил grade).
   * Начисляет XP пропорционально оценке (5/5 → перфектный бонус).
   */
  async onSubmissionGraded(studentId: string, submissionId: string, grade: number, maxGrade = 5) {
    await this.bumpCounter(studentId, 'gradedCount');
    let base = 10;
    if (grade >= maxGrade) {
      base = 50;
      await this.bumpCounter(studentId, 'perfectCount');
    } else if (grade >= maxGrade - 1) {
      base = 30;
    } else if (grade >= Math.ceil(maxGrade / 2)) {
      base = 15;
    }
    await this.awardXp({
      studentId,
      amount: base,
      reason: grade >= maxGrade ? 'submission_graded_perfect' : 'submission_graded',
      metadata: { submissionId, grade },
    });
    return this.checkAndUnlockAchievements(studentId);
  }
}
