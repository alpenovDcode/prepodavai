import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DialogActionsService } from './dialog-actions.service';
import { DialogAction } from './dto/action.dto';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { TutorExchangeNotifier } from '../notifications/tutor-exchange-notifier.service';

describe('DialogActionsService', () => {
  let service: DialogActionsService;
  let prisma: {
    leadDialog: { findUnique: jest.Mock; update: jest.Mock };
    lead: { update: jest.Mock };
    tutorMarketProfile: { upsert: jest.Mock };
    $transaction: jest.Mock;
  };

  const makeDialog = (overrides: Partial<any> = {}) => ({
    id: 'd-1',
    leadId: 'lead-1',
    responderId: 'responder',
    status: 'OPEN',
    paymentSentAt: null,
    lead: { id: 'lead-1', creatorId: 'creator', type: 'COMMISSION' },
    ...overrides,
  });

  beforeEach(async () => {
    prisma = {
      leadDialog: { findUnique: jest.fn(), update: jest.fn() },
      lead: { update: jest.fn() },
      tutorMarketProfile: { upsert: jest.fn() },
      $transaction: jest.fn(async (ops: any[]) => Promise.all(ops)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DialogActionsService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: TutorExchangeNotifier,
          useValue: {
            notifyTrialScheduled: jest.fn().mockResolvedValue(undefined),
            notifyTrialResult: jest.fn().mockResolvedValue(undefined),
            notifyPaymentReported: jest.fn().mockResolvedValue(undefined),
            notifyPaymentConfirmed: jest.fn().mockResolvedValue(undefined),
            notifyDisputeOpened: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get(DialogActionsService);
  });

  describe('access', () => {
    it('404 when dialog is missing', async () => {
      prisma.leadDialog.findUnique.mockResolvedValue(null);
      await expect(service.transition('me', 'd-x', DialogAction.CANCEL))
        .rejects.toBeInstanceOf(NotFoundException);
    });

    it('403 when actor is neither creator nor responder', async () => {
      prisma.leadDialog.findUnique.mockResolvedValue(makeDialog());
      await expect(service.transition('stranger', 'd-1', DialogAction.CANCEL))
        .rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('schedule_trial', () => {
    it('rejects when actor is not creator', async () => {
      prisma.leadDialog.findUnique.mockResolvedValue(makeDialog());
      await expect(service.transition('responder', 'd-1', DialogAction.SCHEDULE_TRIAL))
        .rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects when status is not OPEN', async () => {
      prisma.leadDialog.findUnique.mockResolvedValue(makeDialog({ status: 'PAYMENT_PENDING' }));
      await expect(service.transition('creator', 'd-1', DialogAction.SCHEDULE_TRIAL))
        .rejects.toBeInstanceOf(BadRequestException);
    });

    it('updates to TRIAL_PENDING with link', async () => {
      prisma.leadDialog.findUnique.mockResolvedValue(makeDialog());
      prisma.leadDialog.update.mockResolvedValue({ id: 'd-1', status: 'TRIAL_PENDING' });
      const res = await service.transition('creator', 'd-1', DialogAction.SCHEDULE_TRIAL, {
        trialLessonLink: 'https://zoom.us/j/123',
      });
      expect(prisma.leadDialog.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'TRIAL_PENDING',
            trialLessonLink: 'https://zoom.us/j/123',
          }),
        }),
      );
      expect(res.ok).toBe(true);
    });

    it('принимает http-ссылку', async () => {
      prisma.leadDialog.findUnique.mockResolvedValue(makeDialog());
      prisma.leadDialog.update.mockResolvedValue({ id: 'd-1', status: 'TRIAL_PENDING' });
      await service.transition('creator', 'd-1', DialogAction.SCHEDULE_TRIAL, {
        trialLessonLink: 'http://meet.example.com/abc',
      });
      expect(prisma.leadDialog.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ trialLessonLink: 'http://meet.example.com/abc' }),
        }),
      );
    });

    it('назначает пробный без ссылки (link=null)', async () => {
      prisma.leadDialog.findUnique.mockResolvedValue(makeDialog());
      prisma.leadDialog.update.mockResolvedValue({ id: 'd-1', status: 'TRIAL_PENDING' });
      await service.transition('creator', 'd-1', DialogAction.SCHEDULE_TRIAL, {});
      expect(prisma.leadDialog.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ trialLessonLink: null }),
        }),
      );
    });

    it('отклоняет javascript:-ссылку (защита от XSS в href)', async () => {
      prisma.leadDialog.findUnique.mockResolvedValue(makeDialog());
      await expect(
        service.transition('creator', 'd-1', DialogAction.SCHEDULE_TRIAL, {
          // eslint-disable-next-line no-script-url
          trialLessonLink: 'javascript:alert(document.cookie)',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.leadDialog.update).not.toHaveBeenCalled();
    });

    it('отклоняет data:-ссылку', async () => {
      prisma.leadDialog.findUnique.mockResolvedValue(makeDialog());
      await expect(
        service.transition('creator', 'd-1', DialogAction.SCHEDULE_TRIAL, {
          trialLessonLink: 'data:text/html,<script>alert(1)</script>',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('отклоняет ссылку без схемы (zoom.us/j/1)', async () => {
      prisma.leadDialog.findUnique.mockResolvedValue(makeDialog());
      await expect(
        service.transition('creator', 'd-1', DialogAction.SCHEDULE_TRIAL, {
          trialLessonLink: 'zoom.us/j/1',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('trial_success', () => {
    it('rejects when actor is not responder', async () => {
      prisma.leadDialog.findUnique.mockResolvedValue(makeDialog({ status: 'TRIAL_PENDING' }));
      await expect(service.transition('creator', 'd-1', DialogAction.TRIAL_SUCCESS))
        .rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects when status is not TRIAL_PENDING', async () => {
      prisma.leadDialog.findUnique.mockResolvedValue(makeDialog({ status: 'OPEN' }));
      await expect(service.transition('responder', 'd-1', DialogAction.TRIAL_SUCCESS))
        .rejects.toBeInstanceOf(BadRequestException);
    });

    it('transitions to CONFIRMED when lead.type=FREE (transaction: dialog + lead + 2 upserts)', async () => {
      prisma.leadDialog.findUnique.mockResolvedValue(
        makeDialog({ status: 'TRIAL_PENDING', lead: { id: 'lead-1', creatorId: 'creator', type: 'FREE' } }),
      );
      prisma.leadDialog.update.mockReturnValue({ __d: true });
      prisma.lead.update.mockReturnValue({ __l: true });
      prisma.tutorMarketProfile.upsert.mockReturnValue({ __t: true });
      prisma.$transaction.mockResolvedValue([{ id: 'd-1', status: 'CONFIRMED' }, {}, {}, {}]);

      const res = await service.transition('responder', 'd-1', DialogAction.TRIAL_SUCCESS);

      expect(prisma.$transaction).toHaveBeenCalled();
      const ops = prisma.$transaction.mock.calls[0][0];
      expect(ops).toHaveLength(4);
      expect(prisma.leadDialog.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'CONFIRMED' }),
        }),
      );
      expect(prisma.lead.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'CLOSED' }),
        }),
      );
      expect(prisma.tutorMarketProfile.upsert).toHaveBeenCalledTimes(2);
      expect(res.dialog).toEqual({ id: 'd-1', status: 'CONFIRMED' });
    });

    it('transitions to PAYMENT_PENDING with 3-day deadline when lead.type=COMMISSION', async () => {
      prisma.leadDialog.findUnique.mockResolvedValue(makeDialog({ status: 'TRIAL_PENDING' }));
      prisma.leadDialog.update.mockResolvedValue({ id: 'd-1', status: 'PAYMENT_PENDING' });
      const before = Date.now();
      await service.transition('responder', 'd-1', DialogAction.TRIAL_SUCCESS);
      const call = prisma.leadDialog.update.mock.calls[0][0];
      expect(call.data.status).toBe('PAYMENT_PENDING');
      const deadlineMs = call.data.paymentDeadline.getTime();
      expect(deadlineMs).toBeGreaterThanOrEqual(before + 3 * 24 * 60 * 60 * 1000 - 1000);
    });
  });

  describe('trial_fail', () => {
    it('rejects when actor is not responder', async () => {
      prisma.leadDialog.findUnique.mockResolvedValue(makeDialog({ status: 'TRIAL_PENDING' }));
      await expect(service.transition('creator', 'd-1', DialogAction.TRIAL_FAIL))
        .rejects.toBeInstanceOf(ForbiddenException);
    });

    it('CANCELS dialog and reopens lead in transaction', async () => {
      prisma.leadDialog.findUnique.mockResolvedValue(makeDialog({ status: 'TRIAL_PENDING' }));
      prisma.$transaction.mockResolvedValue([{ id: 'd-1', status: 'CANCELLED' }, {}]);
      const res = await service.transition('responder', 'd-1', DialogAction.TRIAL_FAIL);
      expect(prisma.leadDialog.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'CANCELLED' }) }),
      );
      expect(prisma.lead.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'ACTIVE', lockedById: null }),
        }),
      );
      expect(res.ok).toBe(true);
    });
  });

  describe('payment_sent / confirm_payment', () => {
    it('payment_sent rejects when actor is not responder', async () => {
      prisma.leadDialog.findUnique.mockResolvedValue(makeDialog({ status: 'PAYMENT_PENDING' }));
      await expect(service.transition('creator', 'd-1', DialogAction.PAYMENT_SENT))
        .rejects.toBeInstanceOf(ForbiddenException);
    });

    it('payment_sent sets paymentSentAt', async () => {
      prisma.leadDialog.findUnique.mockResolvedValue(makeDialog({ status: 'PAYMENT_PENDING' }));
      prisma.leadDialog.update.mockResolvedValue({});
      await service.transition('responder', 'd-1', DialogAction.PAYMENT_SENT);
      const call = prisma.leadDialog.update.mock.calls[0][0];
      expect(call.data.paymentSentAt).toBeInstanceOf(Date);
    });

    it('confirm_payment rejects if paymentSentAt is null', async () => {
      prisma.leadDialog.findUnique.mockResolvedValue(makeDialog({ status: 'PAYMENT_PENDING' }));
      await expect(service.transition('creator', 'd-1', DialogAction.CONFIRM_PAYMENT))
        .rejects.toBeInstanceOf(BadRequestException);
    });

    it('confirm_payment closes deal in transaction', async () => {
      prisma.leadDialog.findUnique.mockResolvedValue(
        makeDialog({ status: 'PAYMENT_PENDING', paymentSentAt: new Date() }),
      );
      prisma.$transaction.mockResolvedValue([{ id: 'd-1', status: 'CONFIRMED' }, {}, {}, {}]);
      const res = await service.transition('creator', 'd-1', DialogAction.CONFIRM_PAYMENT);
      expect(prisma.leadDialog.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'CONFIRMED' }) }),
      );
      expect(prisma.lead.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'CLOSED' }) }),
      );
      expect(prisma.tutorMarketProfile.upsert).toHaveBeenCalledTimes(2);
      expect(res.ok).toBe(true);
    });
  });

  describe('dispute', () => {
    it('rejects from OPEN', async () => {
      prisma.leadDialog.findUnique.mockResolvedValue(makeDialog({ status: 'OPEN' }));
      await expect(service.transition('creator', 'd-1', DialogAction.DISPUTE))
        .rejects.toBeInstanceOf(BadRequestException);
    });

    it('allows from PAYMENT_PENDING by either party', async () => {
      prisma.leadDialog.findUnique.mockResolvedValue(makeDialog({ status: 'PAYMENT_PENDING' }));
      prisma.leadDialog.update.mockResolvedValue({ id: 'd-1', status: 'DISPUTED' });
      const r1 = await service.transition('creator', 'd-1', DialogAction.DISPUTE);
      expect(r1.ok).toBe(true);
      const r2 = await service.transition('responder', 'd-1', DialogAction.DISPUTE);
      expect(r2.ok).toBe(true);
    });
  });

  describe('cancel', () => {
    it('rejects from PAYMENT_PENDING', async () => {
      prisma.leadDialog.findUnique.mockResolvedValue(makeDialog({ status: 'PAYMENT_PENDING' }));
      await expect(service.transition('creator', 'd-1', DialogAction.CANCEL))
        .rejects.toBeInstanceOf(BadRequestException);
    });

    it('CANCELS and reopens lead from OPEN', async () => {
      prisma.leadDialog.findUnique.mockResolvedValue(makeDialog({ status: 'OPEN' }));
      prisma.$transaction.mockResolvedValue([{}, {}]);
      const res = await service.transition('responder', 'd-1', DialogAction.CANCEL);
      expect(res.ok).toBe(true);
    });
  });
});
