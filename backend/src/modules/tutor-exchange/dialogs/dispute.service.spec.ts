import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DisputeService } from './dispute.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { TutorExchangeNotifier } from '../notifications/tutor-exchange-notifier.service';

describe('DisputeService', () => {
  let service: DisputeService;
  let prisma: any;

  const disputed = {
    id: 'd-1',
    leadId: 'lead-1',
    responderId: 'resp',
    status: 'DISPUTED',
    lead: { id: 'lead-1', subject: 'X', creatorId: 'creator' },
  };

  beforeEach(async () => {
    prisma = {
      leadDialog: { findUnique: jest.fn(), update: jest.fn() },
      lead: { update: jest.fn() },
      violationReport: { updateMany: jest.fn() },
      tutorMarketProfile: { upsert: jest.fn(), update: jest.fn() },
      $transaction: jest.fn(async (arg: any) =>
        typeof arg === 'function' ? arg(prisma) : Promise.all(arg),
      ),
    };
    const mod = await Test.createTestingModule({
      providers: [
        DisputeService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: TutorExchangeNotifier,
          useValue: { notifyDisputeResolved: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();
    service = mod.get(DisputeService);
  });

  it('404 если диалога нет', async () => {
    prisma.leadDialog.findUnique.mockResolvedValue(null);
    await expect(
      service.resolveDispute('a', 'x', { resolution: 'CANCELLED', note: 'note1' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('400 если диалог не в DISPUTED', async () => {
    prisma.leadDialog.findUnique.mockResolvedValue({ ...disputed, status: 'OPEN' });
    await expect(
      service.resolveDispute('a', 'd-1', { resolution: 'CANCELLED', note: 'note1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('DEAL_CONFIRMED: диалог CONFIRMED, заявка CLOSED, dealsCompleted++ обоим, жалобы RESOLVED', async () => {
    prisma.leadDialog.findUnique.mockResolvedValue(disputed);
    prisma.leadDialog.update.mockResolvedValue({ id: 'd-1', status: 'CONFIRMED' });
    await service.resolveDispute('admin', 'd-1', {
      resolution: 'DEAL_CONFIRMED',
      note: 'заплатил',
    });
    expect(prisma.leadDialog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'CONFIRMED',
          disputeResolution: 'DEAL_CONFIRMED',
          resolvedByAdminId: 'admin',
        }),
      }),
    );
    expect(prisma.lead.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'CLOSED' }) }),
    );
    expect(prisma.tutorMarketProfile.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.violationReport.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { dialogId: 'd-1', status: 'PENDING' },
        data: { status: 'RESOLVED' },
      }),
    );
  });

  it('RETURNED_TO_FEED: диалог CANCELLED, заявка ACTIVE + разблокирована', async () => {
    prisma.leadDialog.findUnique.mockResolvedValue(disputed);
    prisma.leadDialog.update.mockResolvedValue({ id: 'd-1', status: 'CANCELLED' });
    await service.resolveDispute('admin', 'd-1', {
      resolution: 'RETURNED_TO_FEED',
      note: 'пропал',
    });
    expect(prisma.lead.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'ACTIVE',
          lockedById: null,
          lockedAt: null,
        }),
      }),
    );
    expect(prisma.tutorMarketProfile.upsert).not.toHaveBeenCalled();
  });

  it('CANCELLED: диалог CANCELLED, заявка CANCELLED', async () => {
    prisma.leadDialog.findUnique.mockResolvedValue(disputed);
    prisma.leadDialog.update.mockResolvedValue({ id: 'd-1', status: 'CANCELLED' });
    await service.resolveDispute('admin', 'd-1', {
      resolution: 'CANCELLED',
      note: 'неактуально',
    });
    expect(prisma.lead.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'CANCELLED' }) }),
    );
  });

  it('freezeResponder=true: замораживает репетитора', async () => {
    prisma.leadDialog.findUnique.mockResolvedValue(disputed);
    prisma.leadDialog.update.mockResolvedValue({ id: 'd-1', status: 'CANCELLED' });
    await service.resolveDispute('admin', 'd-1', {
      resolution: 'RETURNED_TO_FEED',
      note: 'обман',
      freezeResponder: true,
    });
    expect(prisma.tutorMarketProfile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'resp' },
        update: expect.objectContaining({ disabledByAdminId: 'admin' }),
      }),
    );
  });

  it('unfreezeTutor снимает заморозку', async () => {
    prisma.tutorMarketProfile.update.mockResolvedValue({});
    const r = await service.unfreezeTutor('resp');
    expect(prisma.tutorMarketProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'resp' },
        data: { disabledAt: null, disabledReason: null, disabledByAdminId: null },
      }),
    );
    expect(r).toEqual({ ok: true });
  });
});
