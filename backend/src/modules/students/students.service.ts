import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ClassesService } from '../classes/classes.service';
import { ReferralsService } from '../referrals/referrals.service';

@Injectable()
export class StudentsService {
  constructor(
    private prisma: PrismaService,
    private classesService: ClassesService,
    private referralsService: ReferralsService,
  ) {}

  async createStudent(
    userId: string,
    data: { classId: string; name: string; email?: string; phone?: string; password: string },
  ) {
    if (!data.password) throw new BadRequestException('Пароль обязателен');
    if (!data.name?.trim()) throw new BadRequestException('Имя обязательно');

    const email = data.email?.trim() || null;
    const phone = data.phone?.trim() || null;

    // Verify class ownership
    await this.classesService.getClass(userId, data.classId);

    // Проверяем лимит учеников по тарифу
    const subscription = await this.prisma.userSubscription.findUnique({
      where: { userId },
      include: { plan: true },
    });
    if (subscription?.plan) {
      const maxStudents = (subscription.plan as any).maxStudents as number | null;
      if (maxStudents !== null && maxStudents !== undefined) {
        const totalStudents = await this.prisma.student.count({
          where: { class: { teacherId: userId } },
        });
        if (totalStudents >= maxStudents) {
          throw new ForbiddenException(
            `Достигнут лимит учеников на вашем тарифе (${maxStudents}). Обновите тариф для добавления новых учеников.`,
          );
        }
      }
    }

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
        email: email ?? undefined,
        avatar: this.getInitials(data.name),
      },
    });

    // Write passwordHash + phone via raw SQL to bypass stale Prisma client type validation
    await this.prisma.$executeRaw`
      UPDATE students SET "passwordHash" = ${passwordHash}, "phone" = ${phone} WHERE id = ${student.id}
    `;

    // Реферальная система: автоматически создаём реферал учитель→ученик
    this.referralsService.createTeacherStudentReferral(userId, student.id).catch(() => {});

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
    return {
      id: student.id,
      name: student.name,
      email: student.email,
      avatar: student.avatar,
      className: student.class?.name || null,
      classId: student.classId,
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
