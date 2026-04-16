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
