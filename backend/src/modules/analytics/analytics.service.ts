import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboardStats(userId: string) {
    // 1. Total Students
    // Count students connected to classes owned by this teacher
    const totalStudents = await this.prisma.student.count({
      where: {
        class: {
          teacherId: userId,
        },
      },
    });

    // 2. Tokens Used
    // Sum tokensUsed in UserGeneration table
    const tokenResult = await this.prisma.userGeneration.aggregate({
      where: { userId },
      _sum: {
        tokensUsed: true,
      },
    });
    const tokensUsed = tokenResult._sum.tokensUsed || 0;

    // 3. Average Score
    // Avg grade in Submissions connected to assignments of classes owned by this teacher
    const gradeResult = await this.prisma.submission.aggregate({
      where: {
        assignment: {
          class: {
            teacherId: userId,
          },
        },
        grade: {
          not: null,
        },
      },
      _avg: {
        grade: true,
      },
    });
    const rawAvgScore = gradeResult._avg.grade || 0;
    // Normalize logic: assuming grades are 1-5, let's map to percentage, e.g. 5=100%, 4=80%, 3=60%
    const avgScorePercent = rawAvgScore > 0 ? (rawAvgScore / 5) * 100 : 0;

    // 4. Courses/Classes Active
    const coursesActive = await this.prisma.class.count({
      where: { teacherId: userId },
    });

    // 5. Course Engagement (Class Engagement)
    // Find all classes, their students count and submitted assignment count
    const classes = await this.prisma.class.findMany({
      where: { teacherId: userId },
      include: {
        _count: {
          select: { students: true },
        },
        assignments: {
          include: {
            _count: {
              select: { submissions: true },
            },
          },
        },
      },
    });

    const colors = [
      'bg-primary-600',
      'bg-green-500',
      'bg-yellow-500',
      'bg-red-500',
      'bg-purple-500',
      'bg-blue-500',
    ];
    const courseEngagement = classes
      .map((cls, idx) => {
        const studentCount = cls._count.students;
        const assignmentsCount = cls.assignments.length;

        let engagement = 0;
        if (studentCount > 0 && assignmentsCount > 0) {
          const totalPossibleSubmissions = studentCount * assignmentsCount;
          let actualSubmissions = 0;
          cls.assignments.forEach((a) => {
            actualSubmissions += a._count.submissions;
          });
          engagement = Math.round((actualSubmissions / totalPossibleSubmissions) * 100);
        } else if (studentCount > 0 && assignmentsCount === 0) {
          engagement = 0; // No assignments yet
        }

        return {
          name: cls.name,
          engagement: engagement > 100 ? 100 : engagement,
          color: colors[idx % colors.length],
        };
      })
      .sort((a, b) => b.engagement - a.engagement)
      .slice(0, 4); // Top 4 for UI

    // 6. Top Students
    // Retrieve students and calculate their avg grade
    const students = await this.prisma.student.findMany({
      where: {
        class: {
          teacherId: userId,
        },
      },
      include: {
        submissions: true,
        class: {
          include: {
            assignments: true,
          },
        },
      },
    });

    const studentStats = students.map((student) => {
      const gradedSubmissions = student.submissions.filter((s) => s.grade !== null);
      let avgGrade = 0;
      if (gradedSubmissions.length > 0) {
        const sum = gradedSubmissions.reduce((acc, s) => acc + (s.grade || 0), 0);
        avgGrade = sum / gradedSubmissions.length;
      }

      const scoreNum = Math.round((avgGrade / 5) * 100);

      // Calculate completion %
      const totalClassAssignments = student.class?.assignments.length || 0;
      const completionNum =
        totalClassAssignments > 0
          ? Math.round((student.submissions.length / totalClassAssignments) * 100)
          : 0;

      let status = 'Good';
      if (scoreNum >= 90) status = 'Отлично';
      else if (scoreNum >= 75) status = 'Хорошо';
      else status = 'Средне';

      return {
        name: student.name,
        score: scoreNum,
        scoreRaw: avgGrade,
        completion: completionNum > 100 ? 100 : completionNum,
        status,
      };
    });

    const topStudents = studentStats.sort((a, b) => b.scoreRaw - a.scoreRaw).slice(0, 5); // Return top 5

    return {
      stats: {
        totalStudents,
        tokensUsed,
        avgScore: avgScorePercent.toFixed(1),
        coursesActive,
      },
      courseEngagement,
      topStudents,
    };
  }

  async getQuickStats(userId: string) {
    // 1. Total Generations (User Specific)
    const generationsCount = await this.prisma.userGeneration.count({
      where: { userId, status: 'completed' },
    });

    // 2. Global Generations (to make the counter feel "real-time")
    const globalGenerationsCount = await this.prisma.userGeneration.count({
      where: { status: 'completed' },
    });

    // 3. Total Credits Spent
    const creditResult = await this.prisma.userGeneration.aggregate({
      where: { userId, status: 'completed' },
      _sum: { creditCost: true },
    });
    const totalCreditsSpent = creditResult._sum.creditCost || 0;

    // 4. Fixed count as requested: "сколько функций есть 17"
    const toolsCount = 17;

    return {
      materialsCount: toolsCount,
      generationsCount,
      globalGenerationsCount,
      totalCreditsSpent,
    };
  }

  /**
   * Command-center для главной учителя: что требует внимания прямо сейчас.
   * Агрегирует данные из M1-M4: непроверенное, расписание сегодня, ученики-отстающие,
   * просроченные дедлайны, материалы без тегов/без расписания.
   */
  async getTeacherOverview(userId: string) {
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);
    const in7Days = new Date(now);
    in7Days.setDate(in7Days.getDate() + 7);

    // Все классы учителя одним запросом — остальное построено вокруг них
    const classes = await this.prisma.class.findMany({
      where: { teacherId: userId },
      select: {
        id: true,
        name: true,
        assignments: {
          select: {
            id: true,
            dueDate: true,
            submissions: { select: { studentId: true, grade: true } },
            class: { select: { id: true, name: true } },
          },
        },
        students: { select: { id: true } },
      },
    });

    // === M1: ждут проверки ===
    let totalPending = 0;
    const pendingByClass: Array<{ classId: string; className: string; pending: number }> = [];
    for (const cls of classes) {
      let classPending = 0;
      for (const a of cls.assignments) {
        const submittedIds = new Set(a.submissions.map((s) => s.studentId));
        const gradedIds = new Set(
          a.submissions.filter((s) => s.grade !== null).map((s) => s.studentId),
        );
        classPending += [...submittedIds].filter((id) => !gradedIds.has(id)).length;
      }
      totalPending += classPending;
      if (classPending > 0) {
        pendingByClass.push({ classId: cls.id, className: cls.name, pending: classPending });
      }
    }
    pendingByClass.sort((a, b) => b.pending - a.pending);

    // === M3: расписание и дедлайны ===
    const todayLessons = await (this.prisma as any).lesson.findMany({
      where: {
        userId,
        scheduledAt: { gte: startOfToday, lte: endOfToday },
      },
      select: {
        id: true,
        title: true,
        scheduledAt: true,
        durationMinutes: true,
        class: { select: { id: true, name: true } },
      },
      orderBy: { scheduledAt: 'asc' },
    });

    const nextLesson = await (this.prisma as any).lesson.findFirst({
      where: {
        userId,
        scheduledAt: { gte: now },
      },
      select: {
        id: true,
        title: true,
        scheduledAt: true,
        durationMinutes: true,
        class: { select: { id: true, name: true } },
      },
      orderBy: { scheduledAt: 'asc' },
    });

    // Просроченные дедлайны: dueDate в прошлом + есть сдачи, но не все проверены
    const overdueAssignments = await this.prisma.assignment.findMany({
      where: {
        dueDate: { lt: now },
        OR: [
          { class: { teacherId: userId } },
          { student: { class: { teacherId: userId } } },
        ],
      },
      select: {
        id: true,
        dueDate: true,
        lesson: { select: { id: true, title: true } },
        class: { select: { id: true, name: true } },
        student: { select: { id: true, name: true } },
        submissions: { select: { id: true, grade: true } },
      },
    });
    const overdue = overdueAssignments
      .map((a) => ({
        assignmentId: a.id,
        dueDate: a.dueDate,
        lesson: a.lesson,
        class: a.class,
        student: a.student,
        submittedCount: a.submissions.length,
        gradedCount: a.submissions.filter((s) => s.grade !== null).length,
      }))
      .filter((a) => a.gradedCount < a.submittedCount) // есть сдачи, но не все проверены
      .sort((a, b) => a.dueDate!.getTime() - b.dueDate!.getTime())
      .slice(0, 5);

    // === M2: ученики под наблюдением (risk/watch) ===
    // Агрегируем по всем классам, переиспользуя ту же логику, что в классовой аналитике
    let atRiskTotal = 0;
    let watchTotal = 0;
    const atRiskSamples: Array<{
      id: string;
      name: string;
      classId: string;
      className: string;
      avgGrade: number | null;
      level: 'risk' | 'watch';
    }> = [];

    if (classes.length > 0) {
      const classIds = classes.map((c) => c.id);
      const allStudents = await this.prisma.student.findMany({
        where: { classId: { in: classIds } },
        select: {
          id: true,
          name: true,
          classId: true,
          class: { select: { name: true } },
        },
      });

      // Все сдачи для этих учеников одним запросом
      const studentIds = allStudents.map((s) => s.id);
      const allSubs = studentIds.length > 0
        ? await this.prisma.submission.findMany({
            where: { studentId: { in: studentIds } },
            select: {
              studentId: true,
              grade: true,
              createdAt: true,
              assignment: { select: { dueDate: true, classId: true, studentId: true } },
            },
          })
        : [];

      for (const st of allStudents) {
        const myAll = allSubs.filter((s) => s.studentId === st.id);
        const myGraded = myAll.filter((s) => s.grade !== null);
        if (myGraded.length < 3) continue;
        const avg = myGraded.reduce((sum, s) => sum + (s.grade || 0), 0) / myGraded.length;

        // приблизительная доля сдачи: сколько заданий класса покрыто
        const classAssignmentsCount = classes
          .find((c) => c.id === st.classId)?.assignments.length || 0;
        const rate = classAssignmentsCount > 0 ? myAll.length / classAssignmentsCount : 1;

        const withDue = myAll.filter((s) => s.assignment.dueDate);
        const onTime = withDue.filter(
          (s) => s.createdAt <= (s.assignment.dueDate as Date),
        ).length;
        const onTimeRate = withDue.length > 0 ? onTime / withDue.length : null;

        let level: 'good' | 'watch' | 'risk' = 'good';
        if (avg < 3) level = 'risk';
        else if (rate < 0.5 && classAssignmentsCount >= 3) level = 'risk';
        else if (avg < 3.7) level = 'watch';
        else if (rate < 0.7 && classAssignmentsCount >= 3) level = 'watch';
        else if (onTimeRate !== null && onTimeRate < 0.6) level = 'watch';

        if (level === 'risk') atRiskTotal++;
        if (level === 'watch') watchTotal++;
        if ((level === 'risk' || level === 'watch') && atRiskSamples.length < 5) {
          atRiskSamples.push({
            id: st.id,
            name: st.name,
            classId: st.classId,
            className: st.class.name,
            avgGrade: Math.round(avg * 10) / 10,
            level,
          });
        }
      }
      // Сначала risk, потом watch; внутри — по баллу
      atRiskSamples.sort((a, b) => {
        if (a.level !== b.level) return a.level === 'risk' ? -1 : 1;
        return (a.avgGrade ?? 5) - (b.avgGrade ?? 5);
      });
    }

    // === M4: материалы без тегов (nudge для авто-тегов ИИ) ===
    const untaggedCount = await (this.prisma as any).lesson.count({
      where: {
        userId,
        tags: { isEmpty: true },
      },
    });

    // Уроки без расписания (nudge для планирования)
    const unscheduledRecent = await (this.prisma as any).lesson.count({
      where: {
        userId,
        scheduledAt: null,
        createdAt: { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) }, // за 30 дней
      },
    });

    // Дедлайны на ближайшие 7 дней (напомнить о том что скоро)
    const upcomingDeadlinesCount = await this.prisma.assignment.count({
      where: {
        dueDate: { gte: now, lte: in7Days },
        OR: [
          { class: { teacherId: userId } },
          { student: { class: { teacherId: userId } } },
        ],
      },
    });

    return {
      pendingGrading: {
        total: totalPending,
        byClass: pendingByClass.slice(0, 5),
      },
      schedule: {
        todayCount: todayLessons.length,
        todayLessons: todayLessons.map((l: any) => ({
          id: l.id,
          title: l.title,
          scheduledAt: l.scheduledAt,
          durationMinutes: l.durationMinutes,
          className: l.class?.name || null,
        })),
        nextLesson: nextLesson && !todayLessons.find((l: any) => l.id === nextLesson.id)
          ? {
              id: nextLesson.id,
              title: nextLesson.title,
              scheduledAt: nextLesson.scheduledAt,
              durationMinutes: nextLesson.durationMinutes,
              className: nextLesson.class?.name || null,
            }
          : null,
      },
      atRisk: {
        riskCount: atRiskTotal,
        watchCount: watchTotal,
        samples: atRiskSamples,
      },
      overdue: {
        count: overdue.length,
        items: overdue,
      },
      upcoming: {
        deadlinesIn7Days: upcomingDeadlinesCount,
      },
      nudges: {
        untaggedLessons: untaggedCount,
        unscheduledRecent,
      },
    };
  }
}
