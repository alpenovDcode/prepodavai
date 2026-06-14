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

    // ===== v2-доп: плоский список классов + сабмишены за неделю =====
    // Подсчёт средней оценки по каждому классу + students.length
    const classesV2 = await this.prisma.class.findMany({
      where: { teacherId: userId },
      include: {
        _count: { select: { students: true } },
        students: {
          select: {
            submissions: { select: { grade: true }, where: { grade: { not: null } } },
          },
        },
      },
    });

    const classesFlat = classesV2.map((c) => {
      const grades: number[] = [];
      c.students.forEach((s) => s.submissions.forEach((sub) => sub.grade != null && grades.push(sub.grade)));
      const avgGrade = grades.length ? grades.reduce((a, b) => a + b, 0) / grades.length : null;
      return {
        id: c.id,
        name: c.name,
        studentsCount: c._count.students,
        avgGrade,
      };
    });

    // Submissions за последние 7 дней
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const submissionsThisWeek = await this.prisma.submission.count({
      where: {
        createdAt: { gte: sevenDaysAgo },
        assignment: { class: { teacherId: userId } },
      },
    });

    return {
      // Старый формат — оставляем для legacy DashboardHome:
      stats: {
        totalStudents,
        tokensUsed,
        avgScore: avgScorePercent.toFixed(1),
        coursesActive,
      },
      courseEngagement,
      topStudents,
      // v2-формат — плоские поля для AnalyticsPageV2:
      totalStudents,
      coursesActive,
      submissionsThisWeek,
      averageGrade: gradeResult._avg.grade ?? null,
      classes: classesFlat,
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

  /**
   * Активность за последние 7 дней (для bar-chart на главной v2).
   * Считаем число завершённых генераций пользователя по дням Пн..Вс относительно
   * текущей недели (понедельник — начало недели).
   */
  async getWeeklyActivity(userId: string, _range: 'week' | 'month' = 'week') {
    const dayLabels = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setHours(0, 0, 0, 0);
    // JS getDay: 0=Sun, 1=Mon, ..., 6=Sat. Сдвиг к понедельнику.
    const dow = startOfWeek.getDay();
    const shiftToMonday = dow === 0 ? 6 : dow - 1;
    startOfWeek.setDate(startOfWeek.getDate() - shiftToMonday);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(endOfWeek.getDate() + 7);

    const generations = await this.prisma.userGeneration.findMany({
      where: {
        userId,
        status: 'completed',
        createdAt: { gte: startOfWeek, lt: endOfWeek },
      },
      select: { createdAt: true },
    });

    const buckets = new Array(7).fill(0);
    for (const g of generations) {
      const d = new Date(g.createdAt);
      const idx = Math.floor((d.getTime() - startOfWeek.getTime()) / (24 * 60 * 60 * 1000));
      if (idx >= 0 && idx < 7) buckets[idx] += 1;
    }

    return {
      days: dayLabels.map((label, i) => ({ label, value: buckets[i] })),
    };
  }

  // ===================================================================
  // V2 страница /dashboard/analytics — единый агрегирующий метод
  // ===================================================================

  private rangeWindow(range: string) {
    const map: Record<string, number> = { week: 7, month: 30, semester: 180, year: 365 };
    const days = map[range] ?? 30;
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - days);
    const prevEnd = new Date(start);
    const prevStart = new Date(start);
    prevStart.setDate(prevStart.getDate() - days);
    return { start, end, prevStart, prevEnd, days };
  }

  private engagementLevel(ratio: number | null): 0 | 1 | 2 | 3 | 4 | 5 {
    if (ratio == null) return 0;
    if (ratio >= 0.9) return 5;
    if (ratio >= 0.75) return 4;
    if (ratio >= 0.55) return 3;
    if (ratio >= 0.3) return 2;
    if (ratio > 0) return 1;
    return 0;
  }

  private trendDirection(series: number[]): 'up' | 'down' | 'flat' {
    if (series.length < 2) return 'flat';
    const half = Math.floor(series.length / 2);
    const first = series.slice(0, half);
    const second = series.slice(-half);
    if (!first.length || !second.length) return 'flat';
    const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    const diff = avg(second) - avg(first);
    if (diff > 0.15) return 'up';
    if (diff < -0.15) return 'down';
    return 'flat';
  }

  private initialsFor(name: string): string {
    const cleaned = name.trim();
    if (/^\d/.test(cleaned)) return cleaned.slice(0, 3).toUpperCase();
    const parts = cleaned.split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return cleaned.slice(0, 2).toUpperCase();
  }

  async getOverviewV2(
    userId: string,
    opts: { range: string; classId?: string; filter?: string },
  ) {
    const { range, classId, filter } = opts;
    const win = this.rangeWindow(range);

    const classes = await this.prisma.class.findMany({
      where: { teacherId: userId, ...(classId ? { id: classId } : {}) },
      include: {
        students: { select: { id: true, name: true } },
        assignments: {
          select: {
            id: true,
            createdAt: true,
            dueDate: true,
            lesson: { select: { id: true, title: true, topic: true, createdAt: true } },
          },
        },
      },
    });

    const studentIds = classes.flatMap((c) => c.students.map((s) => s.id));

    const wideStart = new Date(win.end);
    wideStart.setDate(wideStart.getDate() - 365);

    const submissions = studentIds.length
      ? await this.prisma.submission.findMany({
          where: {
            studentId: { in: studentIds },
            createdAt: { gte: wideStart, lte: win.end },
          },
          select: {
            id: true,
            studentId: true,
            grade: true,
            createdAt: true,
            assignment: {
              select: {
                id: true,
                createdAt: true,
                dueDate: true,
                classId: true,
                lesson: { select: { id: true, title: true, topic: true } },
              },
            },
          },
        })
      : [];

    const lessons = await this.prisma.lesson.findMany({
      where: { userId, ...(classId ? { classId } : {}) },
      select: { id: true, createdAt: true },
    });

    const inWin = (d: Date) => d >= win.start && d <= win.end;
    const inPrev = (d: Date) => d >= win.prevStart && d < win.prevEnd;
    const subsNow = submissions.filter((s) => inWin(s.createdAt));
    const subsPrev = submissions.filter((s) => inPrev(s.createdAt));

    const gradedNow = subsNow.filter((s) => s.grade != null);
    const gradedPrev = subsPrev.filter((s) => s.grade != null);
    const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
    const avgGradeNow = avg(gradedNow.map((s) => s.grade as number));
    const avgGradePrev = avg(gradedPrev.map((s) => s.grade as number));

    type SubsArr = typeof submissions;
    const onTimeRate = (subs: SubsArr) => {
      const withDue = subs.filter((s) => s.assignment.dueDate);
      if (!withDue.length) return null;
      const onTime = withDue.filter((s) => s.createdAt <= (s.assignment.dueDate as Date)).length;
      return onTime / withDue.length;
    };
    const onTimeNow = onTimeRate(subsNow);
    const onTimePrev = onTimeRate(subsPrev);

    const activeStudentIds = new Set(subsNow.map((s) => s.studentId));
    const totalStudents = studentIds.length;

    const subTimesNow = subsNow
      .map((s) => (s.createdAt.getTime() - s.assignment.createdAt.getTime()) / 86_400_000)
      .filter((d) => d >= 0 && d < 60);
    const avgSubmitDays = subTimesNow.length ? avg(subTimesNow) : null;
    const subTimesPrev = subsPrev
      .map((s) => (s.createdAt.getTime() - s.assignment.createdAt.getTime()) / 86_400_000)
      .filter((d) => d >= 0 && d < 60);
    const avgSubmitDaysPrev = subTimesPrev.length ? avg(subTimesPrev) : null;

    const materialsTotal = lessons.length;
    const materialsThisPeriod = lessons.filter((l) => inWin(l.createdAt)).length;

    let watchCount = 0;
    let riskCount = 0;
    const weekMs = 7 * 86_400_000;
    const studentStatsList: Array<{
      id: string;
      name: string;
      classId: string;
      className: string;
      avgGrade: number;
      submittedPct: number;
      onTimePct: number | null;
      trend: number[];
      level: 'risk' | 'watch' | 'good';
      direction: 'up' | 'down' | 'flat';
    }> = [];

    for (const cls of classes) {
      for (const st of cls.students) {
        const mySubs = submissions.filter((s) => s.studentId === st.id);
        const mySubsNow = mySubs.filter((s) => inWin(s.createdAt));
        const myGraded = mySubsNow.filter((s) => s.grade != null);
        const stAvg = myGraded.length ? avg(myGraded.map((x) => x.grade as number)) : 0;

        const totalAssign = cls.assignments.length;
        const submittedPct = totalAssign ? (mySubsNow.length / totalAssign) * 100 : 0;
        const myOnTime = onTimeRate(mySubsNow);

        const trend: number[] = [];
        for (let i = 6; i >= 0; i--) {
          const wkEnd = new Date(win.end.getTime() - i * weekMs);
          const wkStart = new Date(wkEnd.getTime() - weekMs);
          const wkGraded = mySubs.filter(
            (s) => s.grade != null && s.createdAt >= wkStart && s.createdAt < wkEnd,
          );
          trend.push(wkGraded.length ? avg(wkGraded.map((x) => x.grade as number)) : 0);
        }
        const direction = this.trendDirection(trend.filter((v) => v > 0));

        let level: 'good' | 'watch' | 'risk' = 'good';
        if (myGraded.length >= 3) {
          if (stAvg < 3) level = 'risk';
          else if (submittedPct < 50 && totalAssign >= 3) level = 'risk';
          else if (stAvg < 3.7) level = 'watch';
          else if (submittedPct < 70 && totalAssign >= 3) level = 'watch';
          else if (myOnTime !== null && myOnTime < 0.6) level = 'watch';
        }
        if (level === 'risk') riskCount++;
        if (level === 'watch') watchCount++;

        studentStatsList.push({
          id: st.id,
          name: st.name,
          classId: cls.id,
          className: cls.name,
          avgGrade: Math.round(stAvg * 10) / 10,
          submittedPct: Math.round(submittedPct),
          onTimePct: myOnTime == null ? null : Math.round(myOnTime * 100),
          trend,
          level,
          direction,
        });
      }
    }

    const trendMonthsCount = range === 'year' ? 12 : 6;
    const monthLabels = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];
    const gradeTrend: Array<{ month: string; currentScore: number | null; prevScore: number | null }> = [];
    for (let i = trendMonthsCount - 1; i >= 0; i--) {
      const refNow = new Date(win.end);
      refNow.setMonth(refNow.getMonth() - i);
      const mStart = new Date(refNow.getFullYear(), refNow.getMonth(), 1);
      const mEnd = new Date(refNow.getFullYear(), refNow.getMonth() + 1, 1);
      const cur = submissions.filter(
        (s) => s.grade != null && s.createdAt >= mStart && s.createdAt < mEnd,
      );
      const refPrev = new Date(refNow);
      refPrev.setFullYear(refPrev.getFullYear() - 1);
      const pStart = new Date(refPrev.getFullYear(), refPrev.getMonth(), 1);
      const pEnd = new Date(refPrev.getFullYear(), refPrev.getMonth() + 1, 1);
      const prv = submissions.filter(
        (s) => s.grade != null && s.createdAt >= pStart && s.createdAt < pEnd,
      );
      gradeTrend.push({
        month: monthLabels[mStart.getMonth()],
        currentScore: cur.length ? Math.round(avg(cur.map((x) => x.grade as number)) * 100) / 100 : null,
        prevScore: prv.length ? Math.round(avg(prv.map((x) => x.grade as number)) * 100) / 100 : null,
      });
    }

    const dist = { five: 0, four: 0, three: 0, two: 0 };
    gradedNow.forEach((s) => {
      const g = s.grade as number;
      if (g >= 5) dist.five++;
      else if (g >= 4) dist.four++;
      else if (g >= 3) dist.three++;
      else dist.two++;
    });
    const gradeDistribution = {
      total: gradedNow.length,
      fives: dist.five,
      fours: dist.four,
      threes: dist.three,
      twos: dist.two,
    };

    const heatClasses = [...classes]
      .sort((a, b) => b.students.length - a.students.length)
      .slice(0, 5);
    const heatmap = {
      weeks: Array.from({ length: 12 }, (_, i) => `Н${i + 1}`),
      classes: heatClasses.map((cls) => {
        const weeks: number[] = [];
        for (let i = 11; i >= 0; i--) {
          const wkEnd = new Date(win.end.getTime() - i * weekMs);
          const wkStart = new Date(wkEnd.getTime() - weekMs);
          const wkSubs = submissions.filter(
            (s) => s.assignment.classId === cls.id && s.createdAt >= wkStart && s.createdAt < wkEnd,
          );
          const withDue = wkSubs.filter((s) => s.assignment.dueDate);
          if (!cls.students.length || !withDue.length) {
            weeks.push(0);
            continue;
          }
          const onTime = withDue.filter((s) => s.createdAt <= (s.assignment.dueDate as Date)).length;
          weeks.push(this.engagementLevel(onTime / withDue.length));
        }
        return { id: cls.id, name: cls.name, weeks };
      }),
    };

    const topicMap = new Map<string, { total: number; hard: number }>();
    gradedNow.forEach((s) => {
      const topic = s.assignment.lesson?.topic || s.assignment.lesson?.title;
      if (!topic) return;
      const e = topicMap.get(topic) ?? { total: 0, hard: 0 };
      e.total++;
      if ((s.grade as number) <= 3) e.hard++;
      topicMap.set(topic, e);
    });
    const topicDifficulty = [...topicMap.entries()]
      .filter(([, v]) => v.total >= 2)
      .map(([topic, v]) => ({
        topic,
        difficulty: Math.round((v.hard / v.total) * 100),
        total: v.total,
      }))
      .sort((a, b) => b.difficulty - a.difficulty)
      .slice(0, 6);

    const weekdayBuckets = [0, 0, 0, 0, 0, 0, 0];
    subsNow.forEach((s) => {
      const d = s.createdAt.getDay();
      const idx = d === 0 ? 6 : d - 1;
      weekdayBuckets[idx]++;
    });
    const submissionTimesByWeekday = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(
      (day, i) => ({ day, count: weekdayBuckets[i] }),
    );

    const lessonMap = new Map<string, {
      lessonId: string;
      title: string;
      grades: number[];
      submitted: number;
      potentialSubmissions: number;
      classNames: Set<string>;
      lateDays: number[];
    }>();
    classes.forEach((cls) =>
      cls.assignments.forEach((a) => {
        if (!a.lesson) return;
        const e = lessonMap.get(a.lesson.id) ?? {
          lessonId: a.lesson.id,
          title: a.lesson.title,
          grades: [],
          submitted: 0,
          potentialSubmissions: 0,
          classNames: new Set<string>(),
          lateDays: [],
        };
        e.potentialSubmissions += cls.students.length || 0;
        e.classNames.add(cls.name);
        lessonMap.set(a.lesson.id, e);
      }),
    );
    subsNow.forEach((s) => {
      const lessonId = s.assignment.lesson?.id;
      if (!lessonId) return;
      const e = lessonMap.get(lessonId);
      if (!e) return;
      e.submitted++;
      if (s.grade != null) e.grades.push(s.grade as number);
      if (s.assignment.createdAt) {
        const days = (s.createdAt.getTime() - s.assignment.createdAt.getTime()) / 86_400_000;
        if (days >= 0 && days < 60) e.lateDays.push(days);
      }
    });
    const topMaterials = [...lessonMap.values()]
      .filter((e) => e.grades.length > 0)
      .map((e) => ({
        lessonId: e.lessonId,
        title: e.title,
        className: [...e.classNames].join(', '),
        avgGrade: Math.round(avg(e.grades) * 10) / 10,
        submittedPct: e.potentialSubmissions
          ? Math.min(100, Math.round((e.submitted / e.potentialSubmissions) * 100))
          : 0,
        avgDays: e.lateDays.length ? Math.round(avg(e.lateDays) * 10) / 10 : null,
      }))
      .sort((a, b) => b.avgGrade - a.avgGrade)
      .slice(0, 4);

    const classComparison = classes.map((cls) => {
      const myStudents = studentStatsList.filter((s) => s.classId === cls.id);
      const clsAvg = myStudents.length
        ? avg(myStudents.map((s) => s.avgGrade).filter((g) => g > 0))
        : 0;
      const trend: number[] = [];
      for (let i = 6; i >= 0; i--) {
        const wkEnd = new Date(win.end.getTime() - i * weekMs);
        const wkStart = new Date(wkEnd.getTime() - weekMs);
        const wkGrades = submissions
          .filter(
            (s) =>
              s.assignment.classId === cls.id &&
              s.grade != null &&
              s.createdAt >= wkStart &&
              s.createdAt < wkEnd,
          )
          .map((s) => s.grade as number);
        trend.push(wkGrades.length ? avg(wkGrades) : 0);
      }
      const clsSubsNow = subsNow.filter((s) => s.assignment.classId === cls.id);
      const ot = onTimeRate(clsSubsNow);
      const direction = this.trendDirection(trend.filter((v) => v > 0));
      return {
        id: cls.id,
        name: cls.name,
        initials: this.initialsFor(cls.name),
        studentsCount: cls.students.length,
        avgGrade: clsAvg > 0 ? Math.round(clsAvg * 10) / 10 : null,
        onTimePct: ot == null ? null : Math.round(ot * 100),
        trend,
        direction,
      };
    });

    const bestStudents = [...studentStatsList]
      .filter((s) => s.avgGrade > 0)
      .sort((a, b) => b.avgGrade - a.avgGrade)
      .slice(0, 3);

    const watchStudents = [...studentStatsList]
      .filter((s) => s.level === 'risk' || s.level === 'watch')
      .sort((a, b) => {
        if (a.level !== b.level) return a.level === 'risk' ? -1 : 1;
        return a.avgGrade - b.avgGrade;
      })
      .slice(0, 3);

    let levelOtl = 0, levelHor = 0, levelUdv = 0, levelRisk = 0;
    studentStatsList.forEach((s) => {
      if (s.avgGrade >= 4.5) levelOtl++;
      else if (s.avgGrade >= 3.5) levelHor++;
      else if (s.avgGrade >= 3) levelUdv++;
      else if (s.avgGrade > 0) levelRisk++;
    });
    let dynUp = 0, dynFlat = 0, dynDown = 0;
    studentStatsList.forEach((s) => {
      if (s.avgGrade <= 0) return;
      if (s.direction === 'up') dynUp++;
      else if (s.direction === 'down') dynDown++;
      else dynFlat++;
    });

    const classOptions = (classId
      ? await this.prisma.class.findMany({
          where: { teacherId: userId },
          select: { id: true, name: true },
        })
      : classes.map((c) => ({ id: c.id, name: c.name })));

    return {
      range,
      classId: classId ?? null,
      filter: filter ?? 'all',
      kpi: {
        avgGrade: gradedNow.length ? Math.round(avgGradeNow * 10) / 10 : null,
        avgGradeDelta: gradedPrev.length ? Math.round((avgGradeNow - avgGradePrev) * 10) / 10 : null,
        onTimePct: onTimeNow == null ? null : Math.round(onTimeNow * 100),
        onTimeDelta:
          onTimeNow == null || onTimePrev == null
            ? null
            : Math.round((onTimeNow - onTimePrev) * 100),
        activeStudents: activeStudentIds.size,
        totalStudents,
        engagementPct: totalStudents
          ? Math.round((activeStudentIds.size / totalStudents) * 100)
          : 0,
        watchCount: watchCount + riskCount,
        riskCount,
        avgSubmitDays: avgSubmitDays == null ? null : Math.round(avgSubmitDays * 10) / 10,
        avgSubmitDaysDelta:
          avgSubmitDays == null || avgSubmitDaysPrev == null
            ? null
            : Math.round((avgSubmitDays - avgSubmitDaysPrev) * 10) / 10,
        materialsThisPeriod,
        materialsTotal,
      },
      gradeTrend,
      gradeDistribution,
      heatmap,
      topicDifficulty,
      submissionTimesByWeekday,
      topMaterials,
      classComparison,
      bestStudents,
      watchStudents,
      levelDistribution: {
        total: studentStatsList.filter((s) => s.avgGrade > 0).length,
        excellent: levelOtl,
        good: levelHor,
        average: levelUdv,
        risk: levelRisk,
      },
      studentDynamics: { up: dynUp, flat: dynFlat, down: dynDown },
      classes: classOptions.sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  async getStudentsLeaderboard(
    userId: string,
    opts: { range: string; classId?: string; page: number; pageSize: number },
  ) {
    const { range, classId, page, pageSize } = opts;
    const win = this.rangeWindow(range);

    const classes = await this.prisma.class.findMany({
      where: { teacherId: userId, ...(classId ? { id: classId } : {}) },
      select: {
        id: true,
        name: true,
        students: { select: { id: true, name: true } },
        _count: { select: { assignments: true } },
      },
    });
    const studentIds = classes.flatMap((c) => c.students.map((s) => s.id));
    if (!studentIds.length) {
      return { total: 0, page, pageSize, items: [] };
    }

    const wideStart = new Date(win.end);
    wideStart.setDate(wideStart.getDate() - 90);
    const submissions = await this.prisma.submission.findMany({
      where: {
        studentId: { in: studentIds },
        createdAt: { gte: wideStart, lte: win.end },
      },
      select: {
        studentId: true,
        grade: true,
        createdAt: true,
        assignment: { select: { dueDate: true, classId: true } },
      },
    });

    const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
    const inWin = (d: Date) => d >= win.start && d <= win.end;
    const weekMs = 7 * 86_400_000;

    const items = classes.flatMap((cls) =>
      cls.students.map((st) => {
        const mine = submissions.filter((s) => s.studentId === st.id);
        const mineNow = mine.filter((s) => inWin(s.createdAt));
        const graded = mineNow.filter((s) => s.grade != null);
        const stAvg = graded.length ? avg(graded.map((g) => g.grade as number)) : 0;
        const totalAssign = cls._count.assignments;
        const submittedPct = totalAssign
          ? Math.round((mineNow.length / totalAssign) * 100)
          : 0;
        const trend: number[] = [];
        for (let i = 6; i >= 0; i--) {
          const wkEnd = new Date(win.end.getTime() - i * weekMs);
          const wkStart = new Date(wkEnd.getTime() - weekMs);
          const wkGraded = mine.filter(
            (s) => s.grade != null && s.createdAt >= wkStart && s.createdAt < wkEnd,
          );
          trend.push(wkGraded.length ? avg(wkGraded.map((g) => g.grade as number)) : 0);
        }
        const direction = this.trendDirection(trend.filter((v) => v > 0));
        return {
          id: st.id,
          name: st.name,
          classId: cls.id,
          className: cls.name,
          avgGrade: Math.round(stAvg * 10) / 10,
          submittedPct: Math.min(100, submittedPct),
          trend,
          direction,
        };
      }),
    );

    const sorted = items
      .filter((i) => i.avgGrade > 0 || i.submittedPct > 0)
      .sort((a, b) => b.avgGrade - a.avgGrade);

    const total = sorted.length;
    const start = (page - 1) * pageSize;
    const slice = sorted.slice(start, start + pageSize);

    return { total, page, pageSize, items: slice };
  }
}
