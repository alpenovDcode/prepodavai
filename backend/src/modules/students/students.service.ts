import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ClassesService } from '../classes/classes.service';

@Injectable()
export class StudentsService {
  constructor(
    private prisma: PrismaService,
    private classesService: ClassesService,
  ) {}

  async createStudent(
    userId: string,
    data: { classId: string; name: string; email: string; password: string },
  ) {
    if (!data.email) throw new BadRequestException('Email обязателен');
    if (!data.password) throw new BadRequestException('Пароль обязателен');

    // Verify class ownership
    await this.classesService.getClass(userId, data.classId);

    // Check email uniqueness within teacher's students
    const existing = await this.prisma.student.findFirst({
      where: { email: data.email, class: { teacherId: userId } },
    });
    if (existing) throw new BadRequestException('Ученик с таким email уже существует в вашем классе');

    const passwordHash = await bcrypt.hash(data.password, 10);

    // Create student without passwordHash first (Prisma client may be stale)
    const student = await this.prisma.student.create({
      data: {
        classId: data.classId,
        name: data.name,
        email: data.email,
        avatar: this.getInitials(data.name),
      },
    });

    // Write passwordHash via raw SQL to bypass stale Prisma client type validation
    await this.prisma.$executeRaw`
      UPDATE students SET "passwordHash" = ${passwordHash} WHERE id = ${student.id}
    `;

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

    return this.prisma.student.findMany({
      where: whereClause,
      include: {
        class: {
          select: { name: true },
        },
      },
      orderBy: { name: 'asc' },
    });
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
      SELECT id, "passwordHash" FROM students WHERE email = ${email} LIMIT 1
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
