import { Test, TestingModule } from '@nestjs/testing';
import { GamificationService } from './gamification.service';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * In-memory мок PrismaService для gamification.
 * Реалистично имитирует upsert/increment/findUnique по нашим четырём моделям.
 */
function createMockPrisma() {
  const studentGamification = new Map<string, any>();
  const students = new Map<string, any>();
  const achievements = new Map<string, any>();
  const studentAchievements = new Map<string, any[]>();
  const xpEvents: any[] = [];

  return {
    _state: { studentGamification, students, achievements, studentAchievements, xpEvents },
    student: {
      findUnique: jest.fn(({ where }: any) => Promise.resolve(students.get(where.id) || null)),
    },
    studentGamification: {
      findUnique: jest.fn(({ where }: any) =>
        Promise.resolve(studentGamification.get(where.studentId) || null)),
      create: jest.fn(({ data }: any) => {
        const row = {
          id: `g_${data.studentId}`,
          studentId: data.studentId,
          xp: 0, level: 1, streakDays: 0, bestStreakDays: 0,
          submittedCount: 0, gradedCount: 0, perfectCount: 0,
          lastActiveDate: null,
          ...data,
        };
        studentGamification.set(data.studentId, row);
        return Promise.resolve(row);
      }),
      update: jest.fn(({ where, data }: any) => {
        const cur = studentGamification.get(where.studentId);
        if (!cur) throw new Error('not found');
        for (const [k, v] of Object.entries(data)) {
          if (v && typeof v === 'object' && 'increment' in (v as any)) {
            cur[k] = (cur[k] || 0) + (v as any).increment;
          } else {
            cur[k] = v;
          }
        }
        studentGamification.set(where.studentId, cur);
        return Promise.resolve(cur);
      }),
    },
    achievement: {
      findMany: jest.fn(() => Promise.resolve(Array.from(achievements.values()))),
    },
    studentAchievement: {
      findMany: jest.fn(({ where }: any) => {
        const arr = studentAchievements.get(where.studentId) || [];
        return Promise.resolve(arr);
      }),
      create: jest.fn(({ data }: any) => {
        const arr = studentAchievements.get(data.studentId) || [];
        const row = { id: `sa_${arr.length}`, unlockedAt: new Date(), ...data };
        arr.push(row);
        studentAchievements.set(data.studentId, arr);
        return Promise.resolve(row);
      }),
    },
    xpEvent: {
      create: jest.fn(({ data }: any) => {
        const row = { id: `e_${xpEvents.length}`, createdAt: new Date(), ...data };
        xpEvents.push(row);
        return Promise.resolve(row);
      }),
    },
  };
}

describe('GamificationService', () => {
  let service: GamificationService;
  let prisma: ReturnType<typeof createMockPrisma>;

  const STUDENT_ID = 'stu-1';

  beforeEach(async () => {
    prisma = createMockPrisma();
    prisma._state.students.set(STUDENT_ID, { id: STUDENT_ID, name: 'Тест Ученик' });

    // Сидим базовый каталог ачивок (как в production seed).
    prisma._state.achievements.set('first-step', {
      key: 'first-step', title: 'Первый шаг', description: '', category: 'submissions',
      conditionField: 'submittedCount', conditionValue: 1, xpReward: 50,
      iconKey: 'zap', color: 'brand', sortOrder: 10, isActive: true,
    });
    prisma._state.achievements.set('streak-3', {
      key: 'streak-3', title: 'Огонёк', description: '', category: 'streak',
      conditionField: 'streakDays', conditionValue: 3, xpReward: 50,
      iconKey: 'flame', color: 'warning', sortOrder: 40, isActive: true,
    });
    prisma._state.achievements.set('perfect-1', {
      key: 'perfect-1', title: 'Отличник', description: '', category: 'grades',
      conditionField: 'perfectCount', conditionValue: 1, xpReward: 100,
      iconKey: 'star', color: 'success', sortOrder: 70, isActive: true,
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GamificationService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(GamificationService);
  });

  describe('getProgress', () => {
    it('создаёт запись StudentGamification при первом вызове', async () => {
      const p = await service.getProgress(STUDENT_ID);
      expect(p.xp).toBe(0);
      expect(p.level).toBe(1);
      expect(p.streakDays).toBe(0);
      expect(prisma.studentGamification.create).toHaveBeenCalledTimes(1);
    });

    it('возвращает массив ачивок с прогрессом и target', async () => {
      const p = await service.getProgress(STUDENT_ID);
      expect(p.achievements.length).toBe(3);
      const firstStep = p.achievements.find(a => a.key === 'first-step')!;
      expect(firstStep.target).toBe(1);
      expect(firstStep.progress).toBe(0);
      expect(firstStep.unlocked).toBe(false);
    });

    it('бросает NotFoundException если student не существует', async () => {
      await expect(service.getProgress('nonexistent')).rejects.toThrow();
    });
  });

  describe('awardXp', () => {
    it('добавляет XP и обновляет level', async () => {
      await service.getProgress(STUDENT_ID); // create record
      await service.awardXp({ studentId: STUDENT_ID, amount: 600, reason: 'test' });
      const p = await service.getProgress(STUDENT_ID);
      expect(p.xp).toBe(600);
      // 600 >= 500 (порог для level 2), поэтому level должен стать 2.
      expect(p.level).toBe(2);
    });

    it('создаёт XpEvent для аудита', async () => {
      await service.getProgress(STUDENT_ID);
      await service.awardXp({ studentId: STUDENT_ID, amount: 20, reason: 'submission_created' });
      expect(prisma._state.xpEvents.length).toBe(1);
      expect(prisma._state.xpEvents[0].amount).toBe(20);
      expect(prisma._state.xpEvents[0].reason).toBe('submission_created');
    });

    it('игнорирует amount=0 (не пишет XpEvent)', async () => {
      await service.getProgress(STUDENT_ID);
      await service.awardXp({ studentId: STUDENT_ID, amount: 0, reason: 'noop' });
      expect(prisma._state.xpEvents.length).toBe(0);
    });
  });

  describe('checkAndUnlockAchievements', () => {
    it('разблокирует first-step после bumpCounter submittedCount', async () => {
      await service.getProgress(STUDENT_ID);
      await service.bumpCounter(STUDENT_ID, 'submittedCount');
      const unlocked = await service.checkAndUnlockAchievements(STUDENT_ID);
      expect(unlocked.find(a => a.key === 'first-step')).toBeDefined();

      const p = await service.getProgress(STUDENT_ID);
      expect(p.achievements.find(a => a.key === 'first-step')!.unlocked).toBe(true);
      // XP-награда за ачивку (+50) тоже начислена.
      expect(p.xp).toBe(50);
    });

    it('идемпотентен — повторный вызов не дублирует разблокировку', async () => {
      await service.getProgress(STUDENT_ID);
      await service.bumpCounter(STUDENT_ID, 'submittedCount');
      await service.checkAndUnlockAchievements(STUDENT_ID);
      const xpAfterFirst = (await service.getProgress(STUDENT_ID)).xp;

      const unlocked = await service.checkAndUnlockAchievements(STUDENT_ID);
      expect(unlocked.length).toBe(0);
      const p2 = await service.getProgress(STUDENT_ID);
      expect(p2.xp).toBe(xpAfterFirst); // не выросло
    });

    it('не разблокирует ачивку, если условие не выполнено', async () => {
      await service.getProgress(STUDENT_ID);
      const unlocked = await service.checkAndUnlockAchievements(STUDENT_ID);
      expect(unlocked.length).toBe(0);
    });
  });

  describe('checkIn (streak)', () => {
    it('первый check-in: streak = 1 и бонусные XP', async () => {
      const p = await service.checkIn(STUDENT_ID);
      expect(p.streakDays).toBe(1);
      expect(p.xp).toBeGreaterThan(0);
    });

    it('повторный check-in в тот же день — streak не растёт', async () => {
      await service.checkIn(STUDENT_ID);
      const xpBefore = (await service.getProgress(STUDENT_ID)).xp;
      await service.checkIn(STUDENT_ID);
      const p = await service.getProgress(STUDENT_ID);
      expect(p.streakDays).toBe(1);
      expect(p.xp).toBe(xpBefore);
    });

    it('check-in на следующий день — streak растёт до 2', async () => {
      await service.checkIn(STUDENT_ID);
      // Симулируем "вчера" — сдвигаем lastActiveDate на день назад.
      const row = prisma._state.studentGamification.get(STUDENT_ID);
      const yesterday = new Date();
      yesterday.setUTCHours(0, 0, 0, 0);
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      row.lastActiveDate = yesterday;

      const p = await service.checkIn(STUDENT_ID);
      expect(p.streakDays).toBe(2);
    });

    it('пропуск дня — streak сбрасывается до 1', async () => {
      await service.checkIn(STUDENT_ID);
      const row = prisma._state.studentGamification.get(STUDENT_ID);
      row.streakDays = 5;
      const longAgo = new Date();
      longAgo.setUTCDate(longAgo.getUTCDate() - 5);
      row.lastActiveDate = longAgo;

      const p = await service.checkIn(STUDENT_ID);
      expect(p.streakDays).toBe(1);
    });

    it('milestone 3 дня → разблокирует streak-3', async () => {
      await service.checkIn(STUDENT_ID);
      // Имитируем: уже было 2 дня подряд, последний раз — вчера.
      const row = prisma._state.studentGamification.get(STUDENT_ID);
      row.streakDays = 2;
      const yesterday = new Date();
      yesterday.setUTCHours(0, 0, 0, 0);
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      row.lastActiveDate = yesterday;

      const p = await service.checkIn(STUDENT_ID);
      expect(p.streakDays).toBe(3);
      expect(p.achievements.find(a => a.key === 'streak-3')!.unlocked).toBe(true);
    });
  });

  describe('хуки submission', () => {
    it('onSubmissionCreated: +20 XP, инкремент submittedCount, разблокирует first-step', async () => {
      const unlocked = await service.onSubmissionCreated(STUDENT_ID, 'sub-1');
      const p = await service.getProgress(STUDENT_ID);

      expect(p.counts.submitted).toBe(1);
      // 20 (создание) + 50 (награда за first-step) = 70
      expect(p.xp).toBe(70);
      expect(unlocked.find(a => a.key === 'first-step')).toBeDefined();
    });

    it('onSubmissionGraded(5): +50 XP, инкремент perfectCount, разблокирует perfect-1', async () => {
      const unlocked = await service.onSubmissionGraded(STUDENT_ID, 'sub-1', 5);
      const p = await service.getProgress(STUDENT_ID);

      expect(p.counts.graded).toBe(1);
      expect(p.counts.perfect).toBe(1);
      // 50 (5/5) + 100 (perfect-1 reward) = 150
      expect(p.xp).toBe(150);
      expect(unlocked.find(a => a.key === 'perfect-1')).toBeDefined();
    });

    it('onSubmissionGraded(3): меньше XP, не разблокирует perfect-1', async () => {
      const unlocked = await service.onSubmissionGraded(STUDENT_ID, 'sub-1', 3);
      const p = await service.getProgress(STUDENT_ID);
      expect(p.counts.perfect).toBe(0);
      expect(p.xp).toBe(15);
      expect(unlocked.find(a => a.key === 'perfect-1')).toBeUndefined();
    });

    it('последовательность сдач корректно копит XP и разблокирует разные ачивки', async () => {
      // 1 submission + 1 grade-5
      await service.onSubmissionCreated(STUDENT_ID, 'sub-1');
      await service.onSubmissionGraded(STUDENT_ID, 'sub-1', 5);

      const p = await service.getProgress(STUDENT_ID);
      expect(p.counts.submitted).toBe(1);
      expect(p.counts.graded).toBe(1);
      expect(p.counts.perfect).toBe(1);
      // 20 + 50(first-step) + 50(grade 5) + 100(perfect-1) = 220
      expect(p.xp).toBe(220);

      // Обе ачивки разблокированы.
      const firstStep = p.achievements.find(a => a.key === 'first-step')!;
      const perfect = p.achievements.find(a => a.key === 'perfect-1')!;
      expect(firstStep.unlocked).toBe(true);
      expect(perfect.unlocked).toBe(true);
    });
  });
});
