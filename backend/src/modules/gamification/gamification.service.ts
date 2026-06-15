import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ACHIEVEMENT_SEED } from './achievement-seed';

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
  return (500 * (level - 1) * level) / 2;
}

function levelFromXp(xp: number): number {
  let lvl = 1;
  while (xpForLevel(lvl + 1) <= xp) lvl++;
  return lvl;
}

interface RankEntry { label: string; fromLevel: number }
const RANKS: RankEntry[] = [
  { label: 'Новичок',            fromLevel: 1  },
  { label: 'Ученик',             fromLevel: 5  },
  { label: 'Старательный',       fromLevel: 9  },
  { label: 'Юный математик',     fromLevel: 13 },
  { label: 'Мастер вычислений',  fromLevel: 18 },
  { label: 'Академик',           fromLevel: 25 },
  { label: 'Гранд-мастер',       fromLevel: 35 },
];

function getRank(level: number): { rank: string; nextRank: { label: string; atLevel: number } | null } {
  let current = RANKS[0];
  for (const r of RANKS) {
    if (level >= r.fromLevel) current = r;
  }
  const idx = RANKS.indexOf(current);
  const next = RANKS[idx + 1] ?? null;
  return {
    rank: current.label,
    nextRank: next ? { label: next.label, atLevel: next.fromLevel } : null,
  };
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
   * Полная сводка для UI: уровень, ранги, опыт, стрик, ачивки, прогресс.
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
    let catalog = await this.prisma.achievement.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });

    // Ленивый сид: если каталог пуст (бэк стартовал до миграции и onModuleInit
    // молча упал), посеять прямо сейчас, чтобы ачивки сразу появились в UI.
    if (catalog.length === 0) {
      try {
        for (const a of ACHIEVEMENT_SEED) {
          await this.prisma.achievement.upsert({
            where: { key: a.key },
            update: { ...a, isActive: true },
            create: { ...a, isActive: true },
          });
        }
        catalog = await this.prisma.achievement.findMany({
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
        });
        this.logger.log(`Lazy-seeded ${catalog.length} achievements`);
      } catch (e: any) {
        this.logger.warn(`Lazy achievement seed failed: ${e?.message}`);
      }
    }

    const unlockedMap = new Map(unlocked.map((u) => [u.achievementKey, u.unlockedAt]));
    const level = levelFromXp(g.xp);
    const nextLevelAt = xpForLevel(level + 1);
    const currentLevelAt = xpForLevel(level);
    const xpInLevel = g.xp - currentLevelAt;
    const xpForNextLevel = nextLevelAt - currentLevelAt;
    const { rank, nextRank } = getRank(level);

    // Место в классе по XP
    const classRank = await this.computeClassRank(studentId, student.classId, g.xp);

    // Массив стриков для UI
    const streaks = [
      {
        id: 'days',
        emoji: '🔥',
        current: g.streakDays,
        unit: 'дней',
        label: 'учусь подряд',
        sub: g.bestStreakDays > g.streakDays
          ? `до личного рекорда ${g.bestStreakDays - g.streakDays} дн.`
          : g.bestStreakDays > 0 ? 'личный рекорд!' : 'начни серию!',
        color: 'fire' as const,
      },
      {
        id: 'fives',
        emoji: '⭐',
        current: g.perfectCount,
        unit: 'пятёрок',
        label: 'отличных оценок',
        sub: 'лучший результат',
        color: 'star' as const,
      },
      {
        id: 'perfect',
        emoji: '💯',
        current: Math.max(0, g.gradedCount - Math.round(g.gradedCount * 0.3)),
        unit: '100%',
        label: 'тестов идеально',
        sub: 'так держать!',
        color: 'perfect' as const,
      },
      {
        id: 'fast',
        emoji: '⚡',
        current: g.submittedCount,
        unit: 'заданий',
        label: 'выполнено всего',
        sub: 'продолжай в том же духе',
        color: 'bolt' as const,
      },
    ];

    const achievements = catalog.map((a) => {
      const isUnlocked = unlockedMap.has(a.key);
      const progress =
        a.conditionField === 'submittedCount' ? g.submittedCount
        : a.conditionField === 'streakDays'   ? g.streakDays
        : a.conditionField === 'gradedCount'  ? g.gradedCount
        : a.conditionField === 'perfectCount' ? g.perfectCount
        : 0;

      let status: 'unlocked' | 'progress' | 'locked';
      if (isUnlocked) {
        status = 'unlocked';
      } else if (progress > 0 && a.conditionValue < 9000) {
        status = 'progress';
      } else {
        status = 'locked';
      }

      return {
        id: a.key,
        key: a.key,
        title: a.title,
        description: a.description,
        category: a.category,
        emoji: a.emoji,
        rarity: a.rarity as 'common' | 'rare' | 'epic' | 'legendary',
        xpReward: a.xpReward,
        status,
        progress: status !== 'unlocked' ? { current: progress, target: a.conditionValue } : undefined,
        unlockedAt: unlockedMap.get(a.key) ?? null,
        // compat legacy
        iconKey: a.iconKey,
        color: a.color,
        target: a.conditionValue,
        unlocked: isUnlocked,
      };
    });

    return {
      studentId,
      name: student.name,
      xp: g.xp,
      level,
      xpInLevel,
      xpForNextLevel,
      nextLevelXp: nextLevelAt,
      currentLevelStartXp: currentLevelAt,
      progressToNextLevel: xpForNextLevel > 0
        ? Math.min(100, Math.round((xpInLevel / xpForNextLevel) * 100))
        : 100,
      rank,
      nextRank,
      streakDays: g.streakDays,
      bestStreakDays: g.bestStreakDays,
      lastActiveDate: g.lastActiveDate,
      achievementsUnlocked: unlocked.length,
      achievementsTotal: catalog.length,
      classRank,
      counts: {
        submitted: g.submittedCount,
        graded: g.gradedCount,
        perfect: g.perfectCount,
      },
      streaks,
      achievements,
    };
  }

  private async computeClassRank(studentId: string, classId: string | null, myXp: number): Promise<number> {
    if (!classId) return 1;
    try {
      const classmates = await this.prisma.student.findMany({
        where: { classId },
        include: { gamification: { select: { xp: true } } },
      });
      const myRank = classmates.filter(
        (s) => s.id !== studentId && (s.gamification?.xp ?? 0) > myXp,
      ).length + 1;
      return myRank;
    } catch {
      return 1;
    }
  }

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
        // no-op
      } else if (diff === 1) {
        streak = g.streakDays + 1;
        xpBonus = 10;
        if (streak === 3 || streak === 7 || streak === 14 || streak === 30 || streak === 100) {
          milestoneReached = streak;
          xpBonus += streak * 5;
        }
      } else {
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

  async awardXp(input: AwardXpInput) {
    const { studentId, amount, reason, metadata } = input;
    if (amount === 0) return;
    await this.ensure(studentId);

    const g = await this.prisma.studentGamification.update({
      where: { studentId },
      data: { xp: { increment: amount } },
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

  async bumpCounter(studentId: string, field: 'submittedCount' | 'gradedCount' | 'perfectCount') {
    await this.ensure(studentId);
    await this.prisma.studentGamification.update({
      where: { studentId },
      data: { [field]: { increment: 1 } } as any,
    });
  }

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
        : a.conditionField === 'streakDays'   ? g.streakDays
        : a.conditionField === 'gradedCount'  ? g.gradedCount
        : a.conditionField === 'perfectCount' ? g.perfectCount
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
