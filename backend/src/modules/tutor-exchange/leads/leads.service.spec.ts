import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { LeadsService } from './leads.service';
import { PrismaService } from '../../../common/prisma/prisma.service';

describe('LeadsService', () => {
  let service: LeadsService;
  let prisma: {
    lead: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    leadDialog: {
      findFirst: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      lead: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      leadDialog: {
        findFirst: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeadsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(LeadsService);
  });

  describe('createLead', () => {
    it('writes subjectLower and forwards to prisma.create', async () => {
      prisma.lead.create.mockResolvedValue({ id: 'lead-1' });
      await service.createLead('user-1', {
        type: 'COMMISSION',
        subject: '  Математика  ',
        grade: '10 класс',
        format: 'ONLINE',
        description: 'Ученик 10 класса, готовится к ЕГЭ по математике',
        studentContact: '+7 (999) 111-22-33',
        price: 1500,
      });
      expect(prisma.lead.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            subject: 'Математика',
            subjectLower: 'математика',
            creatorId: 'user-1',
            price: 1500,
          }),
        }),
      );
    });

    it('rejects COMMISSION with price < 100', async () => {
      await expect(
        service.createLead('user-1', {
          type: 'COMMISSION',
          subject: 'Математика',
          grade: '10',
          format: 'ONLINE',
          description: 'x'.repeat(30),
          studentContact: '+7',
          price: 50,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('sets price=0 for FREE ignoring input', async () => {
      prisma.lead.create.mockResolvedValue({ id: 'lead-1' });
      await service.createLead('user-1', {
        type: 'FREE',
        subject: 'Математика',
        grade: '10',
        format: 'ONLINE',
        description: 'x'.repeat(30),
        studentContact: '+7',
        price: 999,
      });
      expect(prisma.lead.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ price: 0 }),
        }),
      );
    });
  });

  describe('listLeads (feed)', () => {
    it('defaults to status=ACTIVE, excludes own leads, no studentContact in selector', async () => {
      prisma.lead.findMany.mockResolvedValue([]);
      await service.listLeads('user-1', {});
      const call = prisma.lead.findMany.mock.calls[0][0];
      expect(call.where.status).toBe('ACTIVE');
      expect(call.where.creatorId).toEqual({ not: 'user-1' });
      expect(call.select?.studentContact).toBeUndefined();
    });

    it('case-insensitive subject filter via subjectLower', async () => {
      prisma.lead.findMany.mockResolvedValue([]);
      await service.listLeads('user-1', { subject: 'МАТЕМАТИКА' });
      const call = prisma.lead.findMany.mock.calls[0][0];
      expect(call.where.subjectLower).toEqual({ contains: 'математика' });
    });

    it('applies format and type when provided', async () => {
      prisma.lead.findMany.mockResolvedValue([]);
      await service.listLeads('user-1', { format: 'ONLINE', type: 'FREE' });
      const call = prisma.lead.findMany.mock.calls[0][0];
      expect(call.where.format).toBe('ONLINE');
      expect(call.where.type).toBe('FREE');
    });
  });

  describe('getLead', () => {
    const baseLead = {
      id: 'lead-1',
      creatorId: 'author',
      studentContact: '+7 (999) 111-22-33',
      subject: 'Математика',
      status: 'ACTIVE',
      creator: { id: 'author', firstName: 'A', lastName: 'B' },
    } as any;

    it('returns studentContact to creator', async () => {
      prisma.lead.findUnique.mockResolvedValue(baseLead);
      const lead = await service.getLead('author', 'lead-1');
      expect(lead.studentContact).toBe('+7 (999) 111-22-33');
    });

    it('hides studentContact from non-creator on ACTIVE lead', async () => {
      prisma.lead.findUnique.mockResolvedValue(baseLead);
      const lead = await service.getLead('stranger', 'lead-1');
      expect(lead.studentContact).toBeUndefined();
    });

    it('НЕ раскрывает контакт постороннему даже на CLOSED (нет CONFIRMED-диалога)', async () => {
      prisma.lead.findUnique.mockResolvedValue({ ...baseLead, status: 'CLOSED' });
      prisma.leadDialog.findFirst.mockResolvedValue(null);
      const lead = await service.getLead('stranger', 'lead-1');
      expect(lead.studentContact).toBeUndefined();
    });

    it('раскрывает контакт победившему откликнувшемуся на CLOSED', async () => {
      prisma.lead.findUnique.mockResolvedValue({ ...baseLead, status: 'CLOSED' });
      prisma.leadDialog.findFirst.mockResolvedValue({ id: 'dialog-won' });
      const lead = await service.getLead('winner', 'lead-1');
      expect(lead.studentContact).toBe('+7 (999) 111-22-33');
      // проверяем что ищем именно CONFIRMED-диалог этого юзера
      expect(prisma.leadDialog.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            leadId: 'lead-1',
            responderId: 'winner',
            status: 'CONFIRMED',
          }),
        }),
      );
    });

    it('раскрывает контакт создателю без обращения к диалогам', async () => {
      prisma.lead.findUnique.mockResolvedValue({ ...baseLead, status: 'CLOSED' });
      const lead = await service.getLead('author', 'lead-1');
      expect(lead.studentContact).toBe('+7 (999) 111-22-33');
      expect(prisma.leadDialog.findFirst).not.toHaveBeenCalled();
    });

    it('throws NotFound when lead does not exist', async () => {
      prisma.lead.findUnique.mockResolvedValue(null);
      await expect(service.getLead('u', 'lead-x')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('deleteLead', () => {
    it('rejects when caller is not creator', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1', creatorId: 'other', status: 'ACTIVE' });
      await expect(service.deleteLead('me', 'lead-1')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects when lead is not ACTIVE', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1', creatorId: 'me', status: 'LOCKED' });
      await expect(service.deleteLead('me', 'lead-1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('deletes when creator and status=ACTIVE', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1', creatorId: 'me', status: 'ACTIVE' });
      prisma.lead.delete.mockResolvedValue({});
      const res = await service.deleteLead('me', 'lead-1');
      expect(res).toEqual({ ok: true });
      expect(prisma.lead.delete).toHaveBeenCalledWith({ where: { id: 'lead-1' } });
    });
  });
});
