import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ClassesService } from '../classes/classes.service';
import { ReferralsService } from '../referrals/referrals.service';

@Injectable()
export class StudentInvitesService {
  constructor(
    private prisma: PrismaService,
    private classesService: ClassesService,
    private referralsService: ReferralsService,
  ) {}

  async createInvite(teacherId: string, classId?: string) {
    if (classId) {
      await this.classesService.getClass(teacherId, classId);
    }

    const token = crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const invite = await (this.prisma as any).studentInvite.create({
      data: { token, teacherId, classId: classId ?? null, expiresAt },
    });

    return { id: invite.id, token: invite.token, classId: invite.classId, expiresAt: invite.expiresAt };
  }

  async getByToken(token: string) {
    const invite = await (this.prisma as any).studentInvite.findUnique({
      where: { token },
      include: {
        teacher: { select: { firstName: true, lastName: true, username: true, avatar: true } },
        class: { select: { id: true, name: true } },
      },
    });
    if (!invite) throw new NotFoundException('Приглашение не найдено');
    if (invite.revokedAt) throw new BadRequestException('Приглашение отозвано');
    if (invite.expiresAt && invite.expiresAt < new Date())
      throw new BadRequestException('Срок действия приглашения истёк');

    const t = invite.teacher;
    const teacherName =
      [t.firstName, t.lastName].filter(Boolean).join(' ') || t.username || 'Преподаватель';

    return {
      token: invite.token,
      teacher: { name: teacherName, avatar: t.avatar ?? null },
      class: invite.class ? { id: invite.class.id, name: invite.class.name } : null,
    };
  }

  async accept(
    token: string,
    data: { name: string; email?: string; phone?: string; password: string },
  ) {
    if (!data.name?.trim()) throw new BadRequestException('Укажите имя');
    if (!data.password || data.password.length < 6)
      throw new BadRequestException('Пароль должен быть не короче 6 символов');
    const email = data.email?.trim() || null;
    const phone = data.phone?.trim() || null;
    if (!email && !phone)
      throw new BadRequestException('Укажите email или номер телефона');

    const invite = await (this.prisma as any).studentInvite.findUnique({ where: { token } });
    if (!invite) throw new NotFoundException('Приглашение не найдено');
    if (invite.revokedAt) throw new BadRequestException('Приглашение отозвано');
    if (invite.expiresAt && invite.expiresAt < new Date())
      throw new BadRequestException('Срок действия приглашения истёк');

    let classId = invite.classId as string | null;
    if (!classId) {
      const existing = await this.prisma.class.findFirst({
        where: { teacherId: invite.teacherId, name: 'Без класса' },
      });
      const fallback =
        existing ??
        (await this.prisma.class.create({
          data: { teacherId: invite.teacherId, name: 'Без класса' },
        }));
      classId = fallback.id;
    }

    if (email) {
      const existingStudent = await this.prisma.student.findFirst({
        where: { email, class: { teacherId: invite.teacherId } },
      });
      if (existingStudent)
        throw new BadRequestException('Ученик с таким email уже существует у этого преподавателя');
    }

    const passwordHash = await bcrypt.hash(data.password, 10);

    const student = await this.prisma.student.create({
      data: {
        classId,
        name: data.name.trim(),
        email: email ?? undefined,
        avatar: this.getInitials(data.name),
      },
    });

    await this.prisma.$executeRaw`
      UPDATE students SET "passwordHash" = ${passwordHash}, "status" = 'pending', "phone" = ${phone} WHERE id = ${student.id}
    `;

    this.referralsService
      .createTeacherStudentReferral(invite.teacherId, student.id)
      .catch(() => {});

    return { success: true, studentId: student.id, classId };
  }

  async listForTeacher(teacherId: string) {
    return (this.prisma as any).studentInvite.findMany({
      where: { teacherId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
      include: { class: { select: { id: true, name: true } } },
    });
  }

  async revoke(teacherId: string, id: string) {
    const invite = await (this.prisma as any).studentInvite.findUnique({ where: { id } });
    if (!invite || invite.teacherId !== teacherId)
      throw new NotFoundException('Приглашение не найдено');
    await (this.prisma as any).studentInvite.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
    return { success: true };
  }

  private getInitials(name: string): string {
    return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
  }
}
