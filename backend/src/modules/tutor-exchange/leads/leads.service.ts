import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';

export interface LeadFilters {
  subject?: string;
  format?: string;
  type?: string;
  city?: string;
}

export interface CreateLeadInput {
  type: 'FREE' | 'COMMISSION';
  subject: string;
  grade: string;
  format: 'ONLINE' | 'OFFLINE';
  city?: string;
  description: string;
  studentContact: string;
  price?: number;
}

const PUBLIC_LEAD_SELECT = {
  id: true,
  creatorId: true,
  subject: true,
  grade: true,
  format: true,
  city: true,
  description: true,
  type: true,
  price: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  creator: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      avatar: true,
      subject: true,
    },
  },
} as const;

@Injectable()
export class LeadsService {
  constructor(private readonly prisma: PrismaService) {}

  async createLead(userId: string, input: CreateLeadInput) {
    if (input.type === 'COMMISSION' && (!input.price || Number(input.price) < 100)) {
      throw new BadRequestException('Комиссия должна быть не меньше 100 ₽');
    }
    const subject = (input.subject || '').trim();
    const grade = (input.grade || '').trim();
    const description = (input.description || '').trim();
    const studentContact = (input.studentContact || '').trim();
    if (!subject || !grade || !description || !studentContact) {
      throw new BadRequestException('Заполните обязательные поля');
    }
    if (description.length < 30) {
      throw new BadRequestException('Описание должно быть не короче 30 символов');
    }

    return (this.prisma as any).lead.create({
      data: {
        creatorId: userId,
        type: input.type,
        subject,
        subjectLower: subject.toLowerCase(),
        grade,
        format: input.format,
        city: input.format === 'OFFLINE' ? input.city?.trim() || null : null,
        description,
        studentContact,
        price: input.type === 'COMMISSION' ? Number(input.price) : 0,
      },
      select: { ...PUBLIC_LEAD_SELECT, studentContact: true },
    });
  }

  async listLeads(userId: string, filters: LeadFilters) {
    const where: Record<string, any> = {
      status: 'ACTIVE',
      creatorId: { not: userId },
    };
    if (filters.subject && filters.subject.trim()) {
      where.subjectLower = { contains: filters.subject.trim().toLowerCase() };
    }
    if (filters.format) where.format = filters.format;
    if (filters.type) where.type = filters.type;
    if (filters.city && filters.city.trim()) {
      where.city = { contains: filters.city.trim(), mode: 'insensitive' };
    }

    return (this.prisma as any).lead.findMany({
      where,
      select: PUBLIC_LEAD_SELECT,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async listMyLeads(userId: string) {
    return (this.prisma as any).lead.findMany({
      where: { creatorId: userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getLead(userId: string, leadId: string) {
    const lead = await (this.prisma as any).lead.findUnique({
      where: { id: leadId },
      include: {
        creator: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
            subject: true,
          },
        },
      },
    });
    if (!lead) throw new NotFoundException('Заявка не найдена');

    const canSeeContact = lead.creatorId === userId || lead.status === 'CLOSED';
    if (!canSeeContact) {
      const { studentContact: _hidden, ...rest } = lead;
      return rest;
    }
    return lead;
  }

  async updateLead(userId: string, leadId: string, patch: Partial<CreateLeadInput>) {
    const lead = await (this.prisma as any).lead.findUnique({
      where: { id: leadId },
      select: { id: true, creatorId: true, status: true, type: true },
    });
    if (!lead) throw new NotFoundException('Заявка не найдена');
    if (lead.creatorId !== userId) throw new ForbiddenException('Не ваша заявка');
    if (lead.status !== 'ACTIVE') {
      throw new BadRequestException('Изменить можно только активную заявку');
    }

    const data: Record<string, any> = {};
    if (patch.grade !== undefined) data.grade = patch.grade.trim();
    if (patch.format !== undefined) data.format = patch.format;
    if (patch.description !== undefined) {
      const description = patch.description.trim();
      if (description.length < 30) {
        throw new BadRequestException('Описание должно быть не короче 30 символов');
      }
      data.description = description;
    }
    if (patch.studentContact !== undefined) {
      const c = patch.studentContact.trim();
      if (!c) throw new BadRequestException('Контакт не может быть пустым');
      data.studentContact = c;
    }
    if (patch.city !== undefined) {
      data.city = data.format === 'OFFLINE' || (patch.format === 'OFFLINE')
        ? patch.city?.trim() || null
        : null;
    }
    if (patch.price !== undefined && lead.type === 'COMMISSION') {
      const p = Number(patch.price);
      if (!Number.isFinite(p) || p < 100) {
        throw new BadRequestException('Комиссия должна быть не меньше 100 ₽');
      }
      data.price = p;
    }

    return (this.prisma as any).lead.update({
      where: { id: leadId },
      data,
      select: { ...PUBLIC_LEAD_SELECT, studentContact: true },
    });
  }

  async deleteLead(userId: string, leadId: string) {
    const lead = await (this.prisma as any).lead.findUnique({
      where: { id: leadId },
      select: { id: true, creatorId: true, status: true },
    });
    if (!lead) throw new NotFoundException('Заявка не найдена');
    if (lead.creatorId !== userId) throw new ForbiddenException('Не ваша заявка');
    if (lead.status !== 'ACTIVE') {
      throw new BadRequestException('Снять можно только открытую заявку');
    }
    await (this.prisma as any).lead.delete({ where: { id: leadId } });
    return { ok: true as const };
  }
}
