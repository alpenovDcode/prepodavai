import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ClassesService } from '../classes/classes.service';
import { ReferralsService } from '../referrals/referrals.service';
import { EmailService } from '../../common/services/email.service';
import { GamificationService } from '../gamification/gamification.service';

@Injectable()
export class StudentsService {
  private readonly logger = new Logger(StudentsService.name);

  constructor(
    private prisma: PrismaService,
    private classesService: ClassesService,
    private referralsService: ReferralsService,
    private emailService: EmailService,
    private gamificationService: GamificationService,
  ) {}

  async createStudent(
    userId: string,
    data: { classId: string; name: string; email?: string; phone?: string; password: string },
  ) {
    if (!data.password) throw new BadRequestException('Пароль обязателен');
    if (!data.name?.trim()) throw new BadRequestException('Имя обязательно');
    if (!data.email?.trim()) throw new BadRequestException('Email обязателен');

    const email = data.email.trim();
    const phone = data.phone?.trim() || null;

    // Verify class ownership
    await this.classesService.getClass(userId, data.classId);

    // Check email uniqueness within teacher's students (only if email provided)
    if (email) {
      const existing = await this.prisma.student.findFirst({
        where: { email, class: { teacherId: userId } },
      });
      if (existing)
        throw new BadRequestException('Ученик с таким email уже существует в вашем классе');
    }

    const passwordHash = await bcrypt.hash(data.password, 10);

    // Create student without passwordHash first (Prisma client may be stale)
    const student = await this.prisma.student.create({
      data: {
        classId: data.classId,
        name: data.name,
        email,
        avatar: this.getInitials(data.name),
      },
    });

    // Write passwordHash + phone via raw SQL to bypass stale Prisma client type validation
    await this.prisma.$executeRaw`
      UPDATE students SET "passwordHash" = ${passwordHash}, "phone" = ${phone} WHERE id = ${student.id}
    `;

    this.referralsService.createTeacherStudentReferral(userId, student.id).catch(() => {});

    if (email) {
      const teacher = await this.prisma.appUser.findUnique({
        where: { id: userId },
        select: { firstName: true, lastName: true },
      });
      const teacherName = [teacher?.firstName, teacher?.lastName].filter(Boolean).join(' ') || null;
      this.emailService
        .sendStudentCredentialsEmail(email, {
          studentName: data.name,
          password: data.password,
          teacherName,
        })
        .catch((err) => this.logger.warn(`Failed to send credentials email to ${email}: ${err?.message}`));
    }

    return student;
  }

  async getStudents(userId: string, classId?: string) {
    const whereClause: any = {
      class: {
        teacherId: userId,
      },
    };

    if (classId) {
      whereClause.classId = classId;
    }

    const classFilter = classId ? Prisma.sql`AND s."classId" = ${classId}` : Prisma.empty;
    const rows = await this.prisma.$queryRaw<
      {
        id: string;
        name: string;
        email: string | null;
        avatar: string | null;
        accessCode: string | null;
        createdAt: Date;
        status: string;
        classId: string;
        className: string;
      }[]
    >(Prisma.sql`
      SELECT s.id, s.name, s.email, s.avatar, s."accessCode", s."createdAt",
             COALESCE(s.status, 'active') AS status,
             s."classId", c.name AS "className"
      FROM students s
      JOIN classes c ON c.id = s."classId"
      WHERE c."teacherId" = ${userId}
        ${classFilter}
      ORDER BY s.name ASC
    `);

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      avatar: r.avatar,
      accessCode: r.accessCode,
      createdAt: r.createdAt,
      status: r.status,
      classId: r.classId,
      class: { name: r.className },
    }));
  }

  async approveStudent(userId: string, studentId: string) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: { class: true },
    });
    if (!student || student.class.teacherId !== userId) {
      throw new NotFoundException('Student not found');
    }
    await this.prisma.$executeRaw`UPDATE students SET "status" = 'active' WHERE id = ${studentId}`;
    return { success: true };
  }

  async rejectStudent(userId: string, studentId: string) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: { class: true },
    });
    if (!student || student.class.teacherId !== userId) {
      throw new NotFoundException('Student not found');
    }
    return this.prisma.student.delete({ where: { id: studentId } });
  }

  async getStudent(userId: string, studentId: string) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: {
        class: true,
        assignments: {
          include: {
            lesson: true,
            submissions: true,
          },
        },
      },
    });

    if (!student || student.class.teacherId !== userId) {
      throw new NotFoundException('Student not found');
    }

    return student;
  }

  /**
   * Сводка по всем ученикам учителя: метрики на каждого + суммарные KPI.
   * Используется на странице списка учеников (V2).
   * Считается одним проходом по assignments/submissions, чтобы не дёргать БД на каждого ученика.
   */
  async getStudentsOverview(userId: string) {
    const students = await this.prisma.student.findMany({
      where: { class: { teacherId: userId } },
      include: { class: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
    });

    if (students.length === 0) {
      return {
        summary: {
          total: 0,
          classCount: 0,
          avgGrade: null,
          onTimeRate: null,
          activeThisWeek: 0,
          atRiskCount: 0,
          newThisMonth: 0,
        },
        students: [],
      };
    }

    const studentIds = students.map((s) => s.id);
    const classIds = Array.from(new Set(students.map((s) => s.classId)));

    const assignments = await this.prisma.assignment.findMany({
      where: {
        OR: [
          { studentId: { in: studentIds } },
          { classId: { in: classIds } },
        ],
      },
      select: {
        id: true,
        classId: true,
        studentId: true,
        dueDate: true,
        submissions: {
          where: { studentId: { in: studentIds } },
          select: { id: true, studentId: true, grade: true, createdAt: true },
        },
      },
    });

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const studentAssignments = new Map<string, { id: string; dueDate: Date | null }[]>();
    const studentSubmissions = new Map<
      string,
      { grade: number | null; createdAt: Date; assignmentDue: Date | null }[]
    >();

    for (const s of students) {
      studentAssignments.set(s.id, []);
      studentSubmissions.set(s.id, []);
    }

    for (const a of assignments) {
      const targetIds: string[] = a.studentId
        ? [a.studentId]
        : students.filter((s) => s.classId === a.classId).map((s) => s.id);
      for (const sid of targetIds) {
        const list = studentAssignments.get(sid);
        if (list) list.push({ id: a.id, dueDate: a.dueDate });
      }
      for (const sub of a.submissions) {
        const list = studentSubmissions.get(sub.studentId);
        if (list)
          list.push({ grade: sub.grade, createdAt: sub.createdAt, assignmentDue: a.dueDate });
      }
    }

    // delta metrics for KPI cards (current month vs previous month, current week vs previous week)
    const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const allSubs: { grade: number | null; createdAt: Date; assignmentDue: Date | null }[] = [];
    studentSubmissions.forEach((subs) => allSubs.push(...subs));

    const thisMonthGrades = allSubs
      .filter((s) => s.grade !== null && s.createdAt >= monthAgo)
      .map((s) => s.grade as number);
    const lastMonthGrades = allSubs
      .filter((s) => s.grade !== null && s.createdAt >= fourWeeksAgo && s.createdAt < monthAgo)
      .map((s) => s.grade as number);
    const avgGradeDelta: number | null =
      thisMonthGrades.length >= 2 && lastMonthGrades.length >= 2
        ? Math.round(
            (thisMonthGrades.reduce((a, b) => a + b, 0) / thisMonthGrades.length -
              lastMonthGrades.reduce((a, b) => a + b, 0) / lastMonthGrades.length) *
              10,
          ) / 10
        : null;

    const thisWeekWithDue = allSubs.filter((s) => s.assignmentDue && s.createdAt >= weekAgo);
    const lastWeekWithDue = allSubs.filter(
      (s) => s.assignmentDue && s.createdAt >= twoWeeksAgo && s.createdAt < weekAgo,
    );
    const onTimeRateDelta: number | null =
      thisWeekWithDue.length >= 2 && lastWeekWithDue.length >= 2
        ? Math.round(
            (thisWeekWithDue.filter((s) => s.createdAt <= (s.assignmentDue as Date)).length /
              thisWeekWithDue.length -
              lastWeekWithDue.filter((s) => s.createdAt <= (s.assignmentDue as Date)).length /
                lastWeekWithDue.length) *
              100,
          )
        : null;

    let totalGradeSum = 0;
    let totalGradeCount = 0;
    let onTimeSum = 0;
    let onTimeDenom = 0;
    let activeThisWeek = 0;
    let atRiskCount = 0;
    let newThisMonth = 0;

    const studentRows = students.map((s) => {
      const aList = studentAssignments.get(s.id) || [];
      const sList = studentSubmissions.get(s.id) || [];
      const graded = sList.filter((x) => x.grade !== null);
      const avgGrade =
        graded.length > 0
          ? Math.round((graded.reduce((sum, x) => sum + (x.grade || 0), 0) / graded.length) * 10) /
            10
          : null;

      const totalAssigned = aList.length;
      const totalSubmitted = sList.length;
      const submissionRate = totalAssigned > 0 ? totalSubmitted / totalAssigned : 0;

      const withDeadline = sList.filter((x) => x.assignmentDue);
      const onTimeCount = withDeadline.filter(
        (x) => x.createdAt <= (x.assignmentDue as Date),
      ).length;
      const onTimeRate =
        withDeadline.length > 0 ? onTimeCount / withDeadline.length : null;

      const lastActivityAt =
        sList.length > 0
          ? sList.map((x) => x.createdAt).sort((a, b) => b.getTime() - a.getTime())[0]
          : null;

      let risk: 'good' | 'watch' | 'risk' | 'unknown' = 'unknown';
      if (graded.length >= 3) {
        const last3 = graded
          .slice()
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
          .slice(-3)
          .map((x) => x.grade as number);
        const last3Avg = last3.reduce((a, b) => a + b, 0) / last3.length;

        if (avgGrade !== null && avgGrade < 3) risk = 'risk';
        else if (last3Avg < 3) risk = 'risk';
        else if (submissionRate < 0.5 && totalAssigned >= 3) risk = 'risk';
        else if (avgGrade !== null && avgGrade < 3.7) risk = 'watch';
        else if (submissionRate < 0.7 && totalAssigned >= 3) risk = 'watch';
        else if (onTimeRate !== null && onTimeRate < 0.6) risk = 'watch';
        else risk = 'good';
      }

      if (avgGrade !== null) {
        totalGradeSum += avgGrade;
        totalGradeCount += 1;
      }
      if (onTimeRate !== null) {
        onTimeSum += onTimeRate;
        onTimeDenom += 1;
      }
      if (lastActivityAt && lastActivityAt >= weekAgo) activeThisWeek += 1;
      if (risk === 'risk') atRiskCount += 1;
      if (s.createdAt >= monthAgo) newThisMonth += 1;

      return {
        id: s.id,
        name: s.name,
        email: s.email,
        avatar: s.avatar,
        accessCode: s.accessCode,
        status: (s as any).status ?? 'active',
        createdAt: s.createdAt,
        classId: s.classId,
        class: { id: s.class.id, name: s.class.name },
        avgGrade,
        totalAssigned,
        totalSubmitted,
        submissionRate: Math.round(submissionRate * 100) / 100,
        onTimeRate: onTimeRate !== null ? Math.round(onTimeRate * 100) / 100 : null,
        lastActivityAt,
        risk,
      };
    });

    return {
      summary: {
        total: students.length,
        classCount: classIds.length,
        avgGrade:
          totalGradeCount > 0
            ? Math.round((totalGradeSum / totalGradeCount) * 10) / 10
            : null,
        avgGradeDelta,
        onTimeRate:
          onTimeDenom > 0 ? Math.round((onTimeSum / onTimeDenom) * 100) : null,
        onTimeRateDelta,
        activeThisWeek,
        atRiskCount,
        newThisMonth,
      },
      students: studentRows,
    };
  }

  /**
   * Расширенная аналитика по ученику: тренд оценок, агрегаты, уровень риска.
   * Используется на странице профиля ученика.
   */
  async getStudentAnalytics(userId: string, studentId: string) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: { class: { select: { id: true, teacherId: true, name: true } } },
    });
    if (!student || student.class.teacherId !== userId) {
      throw new NotFoundException('Student not found');
    }

    // Все задания, доступные ученику (личные + классные), и его сдачи
    const assignments = await this.prisma.assignment.findMany({
      where: {
        OR: [{ studentId }, { classId: student.classId }],
      },
      include: {
        lesson: { select: { id: true, title: true, topic: true } },
        submissions: { where: { studentId } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const submissions = assignments.flatMap((a) =>
      a.submissions.map((s) => ({
        id: s.id,
        grade: s.grade,
        createdAt: s.createdAt,
        assignmentId: a.id,
        assignmentDueDate: a.dueDate,
        lessonTitle: a.lesson.title,
      })),
    );

    const graded = submissions.filter((s) => s.grade !== null);
    const avgGrade =
      graded.length > 0
        ? Math.round((graded.reduce((sum, s) => sum + (s.grade || 0), 0) / graded.length) * 10) /
          10
        : null;

    // Тренд: последние 20 оценок в хронологическом порядке (по дате сдачи)
    const trend = graded
      .slice()
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .slice(-20)
      .map((s) => ({
        submissionId: s.id,
        grade: s.grade as number,
        date: s.createdAt,
        lessonTitle: s.lessonTitle,
      }));

    const totalAssigned = assignments.length;
    const totalSubmitted = submissions.length;
    const totalGraded = graded.length;
    const submissionRate = totalAssigned > 0 ? totalSubmitted / totalAssigned : 0;

    // Подсчёт «вовремя» — сданных до дедлайна (если дедлайн стоял)
    const submissionsWithDeadline = submissions.filter((s) => s.assignmentDueDate);
    const onTimeCount = submissionsWithDeadline.filter(
      (s) => s.createdAt <= (s.assignmentDueDate as Date),
    ).length;
    const onTimeRate =
      submissionsWithDeadline.length > 0
        ? onTimeCount / submissionsWithDeadline.length
        : null;

    // Просроченные = задание с дедлайном в прошлом, без сдачи
    const now = new Date();
    const overdue = assignments.filter(
      (a) => a.dueDate && a.dueDate < now && a.submissions.length === 0,
    ).length;

    // Risk scoring (минимум 3 оценки для оценки риска)
    let riskLevel: 'good' | 'watch' | 'risk' | 'unknown' = 'unknown';
    const reasons: string[] = [];
    if (graded.length >= 3) {
      const last3 = trend.slice(-3).map((t) => t.grade);
      const last3Avg = last3.reduce((a, b) => a + b, 0) / last3.length;

      if (avgGrade !== null && avgGrade < 3) {
        riskLevel = 'risk';
        reasons.push(`Средний балл ${avgGrade} ниже 3`);
      } else if (last3Avg < 3) {
        riskLevel = 'risk';
        reasons.push('Последние 3 работы — ниже 3 баллов');
      } else if (submissionRate < 0.5 && totalAssigned >= 3) {
        riskLevel = 'risk';
        reasons.push(`Сдано меньше половины заданий (${Math.round(submissionRate * 100)}%)`);
      } else if (avgGrade !== null && avgGrade < 3.7) {
        riskLevel = 'watch';
        reasons.push(`Средний балл ${avgGrade} ниже 3.7`);
      } else if (submissionRate < 0.7 && totalAssigned >= 3) {
        riskLevel = 'watch';
        reasons.push(`Сдаёт нерегулярно (${Math.round(submissionRate * 100)}%)`);
      } else if (onTimeRate !== null && onTimeRate < 0.6) {
        riskLevel = 'watch';
        reasons.push(`Часто сдаёт после дедлайна (${Math.round(onTimeRate * 100)}% вовремя)`);
      } else {
        riskLevel = 'good';
        reasons.push('Стабильная успеваемость');
      }
    }

    const lastActivityAt = submissions.length > 0
      ? submissions
          .map((s) => s.createdAt)
          .sort((a, b) => b.getTime() - a.getTime())[0]
      : null;

    return {
      student: {
        id: student.id,
        name: student.name,
        avatar: student.avatar,
        className: student.class.name,
      },
      summary: {
        avgGrade,
        totalAssigned,
        totalSubmitted,
        totalGraded,
        overdueCount: overdue,
        submissionRate: Math.round(submissionRate * 100) / 100,
        onTimeRate: onTimeRate !== null ? Math.round(onTimeRate * 100) / 100 : null,
        lastActivityAt,
      },
      trend,
      risk: {
        level: riskLevel,
        reasons,
      },
    };
  }

  async getMyGrades(studentId: string) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: {
        class: {
          include: {
            teacher: { select: { subject: true, firstName: true, lastName: true } },
          },
        },
      },
    });
    if (!student) throw new NotFoundException('Student not found');

    const subject = (student.class as any).teacher?.subject || student.class.name || 'Предмет';

    const assignments = await this.prisma.assignment.findMany({
      where: { OR: [{ studentId }, { classId: student.classId }] },
      include: {
        lesson: { select: { id: true, title: true } },
        generation: { select: { id: true, generationType: true } },
        submissions: {
          where: { studentId },
          select: { id: true, grade: true, feedback: true, status: true, createdAt: true, updatedAt: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const now = new Date();
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const allSubs = assignments.flatMap((a) =>
      a.submissions.map((s) => ({ ...s, assignment: a })),
    );
    const gradedSubs = allSubs.filter((s) => s.grade !== null);
    const pendingSubs = allSubs.filter((s) => s.grade === null);

    const avgGrade =
      gradedSubs.length > 0
        ? Math.round(
            (gradedSubs.reduce((sum, s) => sum + (s.grade || 0), 0) / gradedSubs.length) * 10,
          ) / 10
        : 0;

    const gradedThisMonth = gradedSubs.filter((s) => s.updatedAt >= monthAgo);
    const gradedBeforeMonth = gradedSubs.filter((s) => s.updatedAt < monthAgo);
    const avgThisMonth =
      gradedThisMonth.length > 0
        ? gradedThisMonth.reduce((sum, s) => sum + (s.grade || 0), 0) / gradedThisMonth.length
        : null;
    const avgBeforeMonth =
      gradedBeforeMonth.length > 0
        ? gradedBeforeMonth.reduce((sum, s) => sum + (s.grade || 0), 0) / gradedBeforeMonth.length
        : null;
    const monthDelta =
      avgThisMonth !== null && avgBeforeMonth !== null
        ? Math.round((avgThisMonth - avgBeforeMonth) * 10) / 10
        : null;

    let gamification: any = null;
    try {
      gamification = await this.gamificationService.getProgress(studentId);
    } catch {
      // ignore
    }

    const xp = gamification?.xp ?? 0;
    const nextLevelXp = gamification?.nextLevelXp ?? 500;
    const xpToNextLevel = Math.max(0, nextLevelXp - xp);
    const streakDays = gamification?.streakDays ?? 0;

    const recentAch = (gamification?.achievements ?? [])
      .filter(
        (a: any) => a.unlocked && a.unlockedAt && new Date(a.unlockedAt) >= sevenDaysAgo,
      )
      .sort((a: any, b: any) => new Date(b.unlockedAt).getTime() - new Date(a.unlockedAt).getTime())[0];

    const newAchievement = recentAch
      ? { id: recentAch.key, title: recentAch.title, xp: recentAch.xpReward, description: recentAch.description }
      : undefined;

    const typeLabel = (gen: { generationType: string } | null): string => {
      if (!gen) return 'Задание';
      const t = gen.generationType;
      if (t === 'quiz') return 'Тест';
      if (t === 'worksheet') return 'Рабочий лист';
      if (t === 'vocabulary') return 'Словарь';
      if (t === 'presentation') return 'Презентация';
      if (t === 'games') return 'Игра';
      return 'Задание';
    };

    const bySubject = [{ subject, gradesCount: gradedSubs.length, pendingCount: pendingSubs.length, avgGrade }];

    const pending = pendingSubs.slice(0, 10).map((s) => ({
      id: s.id,
      title: s.assignment.lesson.title,
      type: typeLabel(s.assignment.generation),
      subject,
      submittedAt: s.createdAt,
    }));

    const graded = gradedSubs
      .slice()
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .slice(0, 20)
      .map((s) => ({
        id: s.id,
        title: s.assignment.lesson.title,
        type: typeLabel(s.assignment.generation),
        subject,
        grade: s.grade as number,
        gradedAt: s.updatedAt,
        feedback: s.feedback,
      }));

    return {
      avgGrade,
      monthDelta,
      submittedCount: allSubs.length,
      totalAssignments: assignments.length,
      pendingCount: pendingSubs.length,
      xp,
      xpToNextLevel,
      streakDays,
      bySubject,
      pending,
      graded,
      newAchievement,
    };
  }

  async updateStudent(
    userId: string,
    studentId: string,
    data: { name?: string; email?: string; notes?: string; password?: string },
  ) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: { class: true },
    });

    if (!student || student.class.teacherId !== userId) {
      throw new NotFoundException('Student not found');
    }

    const updateData: any = { name: data.name, email: data.email, notes: data.notes };

    await this.prisma.student.update({
      where: { id: studentId },
      data: updateData,
    });

    if (data.password) {
      const passwordHash = await bcrypt.hash(data.password, 10);
      await this.prisma.$executeRaw`
        UPDATE students SET "passwordHash" = ${passwordHash} WHERE id = ${studentId}
      `;

      const studentEmail = (data.email ?? student.email)?.trim();
      if (studentEmail) {
        const teacher = await this.prisma.appUser.findUnique({
          where: { id: userId },
          select: { firstName: true, lastName: true },
        });
        const teacherName = [teacher?.firstName, teacher?.lastName].filter(Boolean).join(' ') || null;
        this.emailService
          .sendStudentCredentialsEmail(studentEmail, {
            studentName: student.name,
            password: data.password,
            teacherName,
          })
          .catch((err) => this.logger.warn(`Failed to send credentials email to ${studentEmail}: ${err?.message}`));
      }
    }

    return this.prisma.student.findUnique({ where: { id: studentId } });
  }

  async deleteStudent(userId: string, studentId: string) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: { class: true },
    });

    if (!student || student.class.teacherId !== userId) {
      throw new NotFoundException('Student not found');
    }

    return this.prisma.student.delete({
      where: { id: studentId },
    });
  }

  async findByEmailAndPassword(email: string, password: string) {
    // Read passwordHash via raw SQL to bypass stale Prisma client
    const rows = await this.prisma.$queryRaw<{ id: string; passwordHash: string | null }[]>`
      SELECT id, "passwordHash" FROM students WHERE email = ${email} AND "passwordHash" IS NOT NULL LIMIT 1
    `;
    if (!rows.length || !rows[0].passwordHash) return null;

    const valid = await bcrypt.compare(password, rows[0].passwordHash);
    if (!valid) return null;

    return this.prisma.student.findUnique({
      where: { id: rows[0].id },
      include: { class: true },
    });
  }

  async findByAccessCode(accessCode: string) {
    return this.prisma.student.findUnique({
      where: { accessCode },
      include: { class: true },
    });
  }

  async findById(id: string) {
    return this.prisma.student.findUnique({
      where: { id },
      include: { class: true },
    });
  }

  async getMe(studentId: string) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: { class: { select: { id: true, name: true } } },
    });
    if (!student) {
      return null;
    }

    // Подкачиваем gamification: streak, xp, level, achievements, counts.
    // Если у ученика ещё нет записи — getProgress сам её создаст.
    let gamification: any = null;
    try {
      gamification = await this.gamificationService.getProgress(studentId);
    } catch {
      // Не валим основной запрос, если gamification сломан.
    }

    return {
      id: student.id,
      name: student.name,
      email: student.email,
      avatar: student.avatar,
      className: student.class?.name || null,
      classId: student.classId,
      // Сводка геймификации, потребляется фронтом StudentSidebar + StudentDashboard.
      streakDays: gamification?.streakDays ?? 0,
      xp: gamification?.xp ?? 0,
      level: gamification?.level ?? 1,
      nextLevelXp: gamification?.nextLevelXp ?? 500,
      currentLevelStartXp: gamification?.currentLevelStartXp ?? 0,
      progressToNextLevel: gamification?.progressToNextLevel ?? 0,
      bestStreakDays: gamification?.bestStreakDays ?? 0,
      counts: gamification?.counts ?? { submitted: 0, graded: 0, perfect: 0 },
      achievements: gamification?.achievements
        ?.filter((a: any) => a.unlocked)
        ?.map((a: any) => ({ id: a.key, key: a.key, title: a.title, unlockedAt: a.unlockedAt }))
        ?? [],
    };
  }

  private getInitials(name: string): string {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }
}
