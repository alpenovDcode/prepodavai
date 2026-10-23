import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { RatingsService } from './ratings.service';
import { TutorExchangeNotifier } from '../notifications/tutor-exchange-notifier.service';
import { PrismaService } from '../../../common/prisma/prisma.service';

describe('RatingsService', () => {
  let service: RatingsService;
  let prisma: {
    leadDialog: { findUnique: jest.Mock };
    tutorRating: {
      findFirst: jest.Mock;
      create: jest.Mock;
      aggregate: jest.Mock;
      findMany: jest.Mock;
    };
    tutorMarketProfile: { upsert: jest.Mock };
    $transaction: jest.Mock;
  };
  let notifier: { notifyRatingReceived: jest.Mock };

  const confirmedDialog = {
    id: 'd-1',
    status: 'CONFIRMED',
    responderId: 'responder',
    lead: { creatorId: 'creator' },
  };

  beforeEach(async () => {
    prisma = {
      leadDialog: { findUnique: jest.fn() },
      tutorRating: {
        findFirst: jest.fn(),
        create: jest.fn(),
        aggregate: jest.fn().mockResolvedValue({ _avg: { score: 4.5 }, _count: { _all: 2 } }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      tutorMarketProfile: { upsert: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn(async (ops: any[]) => Promise.all(ops)),
    };
    notifier = { notifyRatingReceived: jest.fn().mockResolvedValue(undefined) };

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        RatingsService,
        { provide: PrismaService, useValue: prisma },
        { provide: TutorExchangeNotifier, useValue: notifier },
      ],
    }).compile();

    service = mod.get(RatingsService);
  });

  it('rejects score out of 1..5', async () => {
    await expect(
      service.createRating('creator', 'd-1', { score: 0 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.createRating('creator', 'd-1', { score: 6 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws NotFound if dialog missing', async () => {
    prisma.leadDialog.findUnique.mockResolvedValue(null);
    await expect(
      service.createRating('me', 'd-x', { score: 5 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects when dialog is not CONFIRMED', async () => {
    prisma.leadDialog.findUnique.mockResolvedValue({ ...confirmedDialog, status: 'OPEN' });
    await expect(
      service.createRating('creator', 'd-1', { score: 5 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws Forbidden if actor is not a participant', async () => {
    prisma.leadDialog.findUnique.mockResolvedValue(confirmedDialog);
    await expect(
      service.createRating('stranger', 'd-1', { score: 5 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws Conflict if rater already rated this dialog', async () => {
    prisma.leadDialog.findUnique.mockResolvedValue(confirmedDialog);
    prisma.tutorRating.findFirst.mockResolvedValue({ id: 'existing' });
    await expect(
      service.createRating('creator', 'd-1', { score: 5 }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('creator rates responder — recalc agg + notify', async () => {
    prisma.leadDialog.findUnique.mockResolvedValue(confirmedDialog);
    prisma.tutorRating.findFirst.mockResolvedValue(null);
    prisma.tutorRating.create.mockReturnValue({ __r: true });
    prisma.$transaction.mockResolvedValue([{ id: 'r-1', score: 5, rateeId: 'responder' }]);

    const res = await service.createRating('creator', 'd-1', { score: 5, comment: '  ok  ' });

    const createCall = prisma.tutorRating.create.mock.calls[0][0];
    expect(createCall.data).toMatchObject({
      dialogId: 'd-1',
      raterId: 'creator',
      rateeId: 'responder',
      score: 5,
      comment: 'ok',
    });
    expect(prisma.tutorMarketProfile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'responder' },
        update: expect.objectContaining({ ratingAvg: 4.5, ratingCount: 2 }),
      }),
    );
    expect(notifier.notifyRatingReceived).toHaveBeenCalledWith(
      expect.objectContaining({ rateeId: 'responder', raterId: 'creator', score: 5 }),
    );
    expect(res).toEqual({ id: 'r-1', score: 5, rateeId: 'responder' });
  });

  it('responder rates creator', async () => {
    prisma.leadDialog.findUnique.mockResolvedValue(confirmedDialog);
    prisma.tutorRating.findFirst.mockResolvedValue(null);
    prisma.$transaction.mockResolvedValue([{ id: 'r-2', rateeId: 'creator' }]);
    await service.createRating('responder', 'd-1', { score: 4 });
    const call = prisma.tutorRating.create.mock.calls[0][0];
    expect(call.data.rateeId).toBe('creator');
  });
});
