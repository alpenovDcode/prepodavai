import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DialogsService } from './dialogs.service';
import { PrismaService } from '../../../common/prisma/prisma.service';

describe('DialogsService', () => {
  let service: DialogsService;
  let prisma: {
    lead: { findUnique: jest.Mock; update: jest.Mock };
    leadDialog: {
      count: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      lead: { findUnique: jest.fn(), update: jest.fn() },
      leadDialog: {
        count: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(async (ops: any[]) => Promise.all(ops)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DialogsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(DialogsService);
  });

  describe('createDialog', () => {
    const activeLead = { id: 'lead-1', status: 'ACTIVE', creatorId: 'author' };

    it('throws NotFound when lead does not exist', async () => {
      prisma.lead.findUnique.mockResolvedValue(null);
      await expect(service.createDialog('me', { leadId: 'x' }))
        .rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects when lead belongs to caller', async () => {
      prisma.lead.findUnique.mockResolvedValue({ ...activeLead, creatorId: 'me' });
      await expect(service.createDialog('me', { leadId: 'lead-1' }))
        .rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects when lead is not ACTIVE', async () => {
      prisma.lead.findUnique.mockResolvedValue({ ...activeLead, status: 'LOCKED' });
      await expect(service.createDialog('me', { leadId: 'lead-1' }))
        .rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects when responder has 5 active dialogs', async () => {
      prisma.lead.findUnique.mockResolvedValue(activeLead);
      prisma.leadDialog.count.mockResolvedValue(5);
      await expect(service.createDialog('me', { leadId: 'lead-1' }))
        .rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects when responder has overdue PAYMENT_PENDING', async () => {
      prisma.lead.findUnique.mockResolvedValue(activeLead);
      prisma.leadDialog.count.mockResolvedValue(1);
      prisma.leadDialog.findFirst.mockResolvedValue({ id: 'd-old' });
      await expect(service.createDialog('me', { leadId: 'lead-1' }))
        .rejects.toBeInstanceOf(BadRequestException);
    });

    it('locks lead and creates dialog in one transaction on success', async () => {
      prisma.lead.findUnique.mockResolvedValue(activeLead);
      prisma.leadDialog.count.mockResolvedValue(0);
      prisma.leadDialog.findFirst.mockResolvedValue(null);
      prisma.lead.update.mockReturnValue({ __lead_update: true });
      prisma.leadDialog.create.mockReturnValue({ __dialog_create: true });
      prisma.$transaction.mockResolvedValue([{}, { id: 'd-1', status: 'OPEN' }]);

      const result = await service.createDialog('me', { leadId: 'lead-1' });
      expect(prisma.lead.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'lead-1' },
          data: expect.objectContaining({ status: 'LOCKED', lockedById: 'me' }),
        }),
      );
      expect(prisma.leadDialog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            leadId: 'lead-1',
            responderId: 'me',
            status: 'OPEN',
          }),
        }),
      );
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(result).toEqual({ id: 'd-1', status: 'OPEN' });
    });
  });

  describe('listMyDialogs', () => {
    it('filters by responder OR lead creator', async () => {
      prisma.leadDialog.findMany.mockResolvedValue([]);
      await service.listMyDialogs('me');
      const call = prisma.leadDialog.findMany.mock.calls[0][0];
      expect(call.where.OR).toEqual([
        { responderId: 'me' },
        { lead: { creatorId: 'me' } },
      ]);
    });
  });

  describe('getDialog', () => {
    const baseDialog = {
      id: 'd-1',
      status: 'OPEN',
      responderId: 'responder',
      lead: {
        id: 'lead-1',
        creatorId: 'creator',
        studentContact: '+7...',
      },
      messages: [],
    } as any;

    it('throws NotFound if dialog is missing', async () => {
      prisma.leadDialog.findUnique.mockResolvedValue(null);
      await expect(service.getDialog('me', 'd-x')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws Forbidden if user is not a participant', async () => {
      prisma.leadDialog.findUnique.mockResolvedValue(baseDialog);
      await expect(service.getDialog('stranger', 'd-1')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('hides studentContact for non-CONFIRMED dialog', async () => {
      prisma.leadDialog.findUnique.mockResolvedValue(baseDialog);
      const d = await service.getDialog('responder', 'd-1');
      expect(d.lead.studentContact).toBeUndefined();
    });

    it('reveals studentContact once dialog is CONFIRMED', async () => {
      prisma.leadDialog.findUnique.mockResolvedValue({ ...baseDialog, status: 'CONFIRMED' });
      const d = await service.getDialog('responder', 'd-1');
      expect(d.lead.studentContact).toBe('+7...');
    });
  });

  describe('cancelDialog', () => {
    const active = {
      id: 'd-1',
      status: 'OPEN',
      leadId: 'lead-1',
      responderId: 'responder',
      lead: { creatorId: 'creator' },
    } as any;

    it('throws Forbidden if not participant', async () => {
      prisma.leadDialog.findUnique.mockResolvedValue(active);
      await expect(service.cancelDialog('stranger', 'd-1'))
        .rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects if dialog already CLOSED/CANCELLED/CONFIRMED', async () => {
      prisma.leadDialog.findUnique.mockResolvedValue({ ...active, status: 'CANCELLED' });
      await expect(service.cancelDialog('responder', 'd-1'))
        .rejects.toBeInstanceOf(BadRequestException);
    });

    it('runs transaction: dialog→CANCELLED + lead→ACTIVE', async () => {
      prisma.leadDialog.findUnique.mockResolvedValue(active);
      prisma.leadDialog.update.mockReturnValue({ __d: true });
      prisma.lead.update.mockReturnValue({ __l: true });
      prisma.$transaction.mockResolvedValue([{}, {}]);
      const res = await service.cancelDialog('responder', 'd-1');
      expect(prisma.leadDialog.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'd-1' },
          data: expect.objectContaining({ status: 'CANCELLED' }),
        }),
      );
      expect(prisma.lead.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'lead-1' },
          data: expect.objectContaining({ status: 'ACTIVE', lockedById: null }),
        }),
      );
      expect(res).toEqual({ ok: true });
    });

    it('allows creator to cancel', async () => {
      prisma.leadDialog.findUnique.mockResolvedValue(active);
      prisma.$transaction.mockResolvedValue([{}, {}]);
      await expect(service.cancelDialog('creator', 'd-1')).resolves.toEqual({ ok: true });
    });
  });
});
