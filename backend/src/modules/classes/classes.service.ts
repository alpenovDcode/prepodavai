import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class ClassesService {
  constructor(private prisma: PrismaService) {}

  async createClass(userId: string, data: { name: string; description?: string }) {
    try {
      // Проверяем лимит классов по тарифу
      const subscription = await this.prisma.userSubscription.findUnique({
        where: { userId },
        include: { plan: true },
      });
      if (subscription?.plan) {
        const maxClasses = (subscription.plan as any).maxClasses as number | null;
        if (maxClasses !== null && maxClasses !== undefined) {
          const currentCount = await this.prisma.class.count({ where: { teacherId: userId } });
          if (currentCount >= maxClasses) {
            throw new ForbiddenException(
              `Достигнут лимит классов на вашем тарифе (${maxClasses}). Обновите тариф для создания новых классов.`,
            );
          }
        }
      }

      return await this.prisma.class.create({
        data: {
          ...data,
          teacherId: userId,
        },
      });
    } catch (error) {
      console.error('Error creating class:', error);
      throw error;
    }
  }

  async getClasses(userId: string) {
    try {
      return await this.prisma.class.findMany({
        where: { teacherId: userId },
        include: {
          _count: {
            select: { students: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      console.error('Error getting classes:', error);
      throw error;
    }
  }

  async getClass(userId: string, classId: string) {
    const cls = await this.prisma.class.findUnique({
      where: { id: classId },
      include: {
        students: true,
        assignments: {
          include: {
            lesson: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!cls || cls.teacherId !== userId) {
      throw new NotFoundException('Class not found');
    }

    return cls;
  }

  async updateClass(
    userId: string,
    classId: string,
    data: { name?: string; description?: string },
  ) {
    const cls = await this.prisma.class.findUnique({
      where: { id: classId },
    });

    if (!cls || cls.teacherId !== userId) {
      throw new NotFoundException('Class not found');
    }

    return this.prisma.class.update({
      where: { id: classId },
      data,
    });
  }

  async deleteClass(userId: string, classId: string) {
    const cls = await this.prisma.class.findUnique({
      where: { id: classId },
    });

    if (!cls || cls.teacherId !== userId) {
      throw new NotFoundException('Class not found');
    }

    return this.prisma.class.delete({
      where: { id: classId },
    });
  }

  /**
   * Аналитика по классу: средний балл, % сдачи, распределение оценок,
   * разбивка по ученикам (с риск-уровнем) и тренд по неделям.
   */
  async getClassAnalytics(userId: string, classId: string) {
    const cls = await this.prisma.class.findUnique({
      where: { id: classId },
      include: {
        students: { select: { id: true, name: true, avatar: true } },
        assignments: {
          include: {
            submissions: {
              select: {
                id: true,
                grade: true,
                studentId: true,
                createdAt: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!cls || cls.teacherId !== userId) {
      throw new NotFoundException('Class not found');
    }

    const studentIds = new Set(cls.students.map((s) => s.id));
    const totalAssignments = cls.assignments.length;
    const totalStudents = cls.students.length;

    // Все сдачи учеников этого класса
    const allSubmissions = cls.assignments.flatMap((a) =>
      a.submissions
        .filter((s) => studentIds.has(s.studentId))
        .map((s) => ({
          ...s,
          assignmentId: a.id,
          assignmentDueDate: a.dueDate,
        })),
    );

    const gradedSubmissions = allSubmissions.filter((s) => s.grade !== null);
    const avgGrade =
      gradedSubmissions.length > 0
        ? Math.round(
            (gradedSubmissions.reduce((sum, s) => sum + (s.grade || 0), 0) /
              gradedSubmissions.length) *
              10,
          ) / 10
        : null;

    // % сдачи: ожидаемое = students * assignments, фактическое = уникальные (student, assignment) с сдачей
    const expectedSubmissions = totalStudents * totalAssignments;
    const actualSubmissions = new Set(
      allSubmissions.map((s) => `${s.assignmentId}:${s.studentId}`),
    ).size;
    const submissionRate =
      expectedSubmissions > 0 ? actualSubmissions / expectedSubmissions : 0;

    // % вовремя
    const submissionsWithDeadline = allSubmissions.filter((s) => s.assignmentDueDate);
    const onTimeCount = submissionsWithDeadline.filter(
      (s) => s.createdAt <= (s.assignmentDueDate as Date),
    ).length;
    const onTimeRate =
      submissionsWithDeadline.length > 0
        ? onTimeCount / submissionsWithDeadline.length
        : null;

    // Распределение оценок 1..5
    const gradeDistribution: Record<string, number> = {
      '1': 0, '2': 0, '3': 0, '4': 0, '5': 0,
    };
    for (const s of gradedSubmissions) {
      const key = String(s.grade);
      if (key in gradeDistribution) gradeDistribution[key] += 1;
    }

    // Тренд: средний балл по неделям за последние 8 недель
    const weeksTrend = this._buildWeeklyTrend(gradedSubmissions, 8);

    // Разбивка по ученикам
    const studentBreakdown = cls.students
      .map((student) => {
        const mySubs = allSubmissions.filter((s) => s.studentId === student.id);
        const myGraded = mySubs.filter((s) => s.grade !== null);
        const sAvg =
          myGraded.length > 0
            ? Math.round(
                (myGraded.reduce((sum, s) => sum + (s.grade || 0), 0) / myGraded.length) * 10,
              ) / 10
            : null;
        const sRate = totalAssignments > 0 ? mySubs.length / totalAssignments : 0;
        const myWithDl = mySubs.filter((s) => s.assignmentDueDate);
        const myOnTime = myWithDl.filter(
          (s) => s.createdAt <= (s.assignmentDueDate as Date),
        ).length;
        const sOnTime = myWithDl.length > 0 ? myOnTime / myWithDl.length : null;

        const riskLevel = this._calcRiskLevel(myGraded.length, sAvg, sRate, sOnTime, totalAssignments);

        return {
          id: student.id,
          name: student.name,
          avatar: student.avatar,
          avgGrade: sAvg,
          submitted: mySubs.length,
          graded: myGraded.length,
          totalAssignments,
          submissionRate: Math.round(sRate * 100) / 100,
          onTimeRate: sOnTime !== null ? Math.round(sOnTime * 100) / 100 : null,
          riskLevel,
        };
      })
      .sort((a, b) => {
        // Группа риска впереди
        const order = { risk: 0, watch: 1, unknown: 2, good: 3 } as const;
        if (order[a.riskLevel] !== order[b.riskLevel]) {
          return order[a.riskLevel] - order[b.riskLevel];
        }
        // Внутри группы — по средней оценке
        return (a.avgGrade ?? 99) - (b.avgGrade ?? 99);
      });

    const atRisk = studentBreakdown.filter(
      (s) => s.riskLevel === 'risk' || s.riskLevel === 'watch',
    );

    return {
      classInfo: {
        id: cls.id,
        name: cls.name,
        totalStudents,
        totalAssignments,
      },
      summary: {
        avgGrade,
        submissionRate: Math.round(submissionRate * 100) / 100,
        onTimeRate: onTimeRate !== null ? Math.round(onTimeRate * 100) / 100 : null,
        gradedCount: gradedSubmissions.length,
        submissionsCount: actualSubmissions,
        expectedSubmissions,
      },
      gradeDistribution,
      weeksTrend,
      studentBreakdown,
      atRisk,
    };
  }

  private _buildWeeklyTrend(
    submissions: { grade: number | null; createdAt: Date }[],
    weeks: number,
  ) {
    const now = new Date();
    const buckets: { weekStart: Date; grades: number[] }[] = [];
    for (let i = weeks - 1; i >= 0; i--) {
      const start = new Date(now);
      start.setDate(start.getDate() - i * 7);
      start.setHours(0, 0, 0, 0);
      // align to monday for stable week boundary
      const dayOfWeek = (start.getDay() + 6) % 7; // 0 = monday
      start.setDate(start.getDate() - dayOfWeek);
      buckets.push({ weekStart: start, grades: [] });
    }

    for (const s of submissions) {
      if (s.grade === null) continue;
      const ts = s.createdAt.getTime();
      // Find latest bucket whose weekStart <= ts
      for (let i = buckets.length - 1; i >= 0; i--) {
        if (buckets[i].weekStart.getTime() <= ts) {
          buckets[i].grades.push(s.grade);
          break;
        }
      }
    }

    return buckets.map((b) => ({
      weekStart: b.weekStart,
      avgGrade:
        b.grades.length > 0
          ? Math.round((b.grades.reduce((x, y) => x + y, 0) / b.grades.length) * 10) / 10
          : null,
      count: b.grades.length,
    }));
  }

  private _calcRiskLevel(
    gradedCount: number,
    avgGrade: number | null,
    submissionRate: number,
    onTimeRate: number | null,
    totalAssignments: number,
  ): 'good' | 'watch' | 'risk' | 'unknown' {
    if (gradedCount < 3) return 'unknown';
    if (avgGrade !== null && avgGrade < 3) return 'risk';
    if (submissionRate < 0.5 && totalAssignments >= 3) return 'risk';
    if (avgGrade !== null && avgGrade < 3.7) return 'watch';
    if (submissionRate < 0.7 && totalAssignments >= 3) return 'watch';
    if (onTimeRate !== null && onTimeRate < 0.6) return 'watch';
    return 'good';
  }
}
