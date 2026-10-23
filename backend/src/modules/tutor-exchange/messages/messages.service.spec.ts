import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { MessagesService } from './messages.service';
import { ModerationService } from './moderation.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { TutorExchangeNotifier } from '../notifications/tutor-exchange-notifier.service';

describe('MessagesService', () => {
  let service: MessagesService;
  let prisma: {
    leadDialog: { findUnique: jest.Mock };
    leadMessage: { create: jest.Mock; findMany: jest.Mock };
    $transaction: jest.Mock;
  };

  const openDialog = {
    id: 'd-1',
    status: 'OPEN',
    responderId: 'responder',
    lead: { id: 'lead-1', subject: 'Математика', creatorId: 'creator' },
  };

  beforeEach(async () => {
    prisma = {
      leadDialog: { findUnique: jest.fn() },
      leadMessage: { create: jest.fn(), findMany: jest.fn() },
      $transaction: jest.fn(async (ops: any[]) => Promise.all(ops)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagesService,
        ModerationService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: TutorExchangeNotifier,
          useValue: { notifyMessageNew: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(MessagesService);
  });

  describe('sendMessage', () => {
    it('throws NotFound if dialog is missing', async () => {
      prisma.leadDialog.findUnique.mockResolvedValue(null);
      await expect(service.sendMessage('u', 'd-x', { content: 'hi' }))
        .rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws Forbidden if not participant', async () => {
      prisma.leadDialog.findUnique.mockResolvedValue(openDialog);
      await expect(service.sendMessage('stranger', 'd-1', { content: 'hi' }))
        .rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects when dialog is CANCELLED/CLOSED', async () => {
      prisma.leadDialog.findUnique.mockResolvedValue({ ...openDialog, status: 'CANCELLED' });
      await expect(service.sendMessage('responder', 'd-1', { content: 'hi' }))
        .rejects.toBeInstanceOf(BadRequestException);
    });

    it('creates a plain message when no contact detected', async () => {
      prisma.leadDialog.findUnique.mockResolvedValue(openDialog);
      prisma.leadMessage.create.mockResolvedValue({ id: 'm-1', flagged: false, isSystem: false });
      const res = await service.sendMessage('responder', 'd-1', { content: 'пришлю задание завтра' });
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.leadMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            dialogId: 'd-1',
            senderId: 'responder',
            flagged: false,
            isSystem: false,
          }),
        }),
      );
      expect(res).toEqual({ id: 'm-1', flagged: false, isSystem: false });
    });

    it('flags message and adds system warning inside transaction when phone detected', async () => {
      prisma.leadDialog.findUnique.mockResolvedValue(openDialog);
      prisma.leadMessage.create
        .mockReturnValueOnce({ __user: true })
        .mockReturnValueOnce({ __sys: true });
      prisma.$transaction.mockResolvedValue([
        { id: 'm-1', flagged: true, isSystem: false },
        { id: 'm-sys', isSystem: true },
      ]);

      const res = await service.sendMessage('responder', 'd-1', {
        content: 'напиши +7 999 111-22-33',
      });

      expect(prisma.$transaction).toHaveBeenCalled();
      // первый create - от пользователя, flagged
      const userCall = prisma.leadMessage.create.mock.calls[0][0];
      expect(userCall.data).toMatchObject({
        senderId: 'responder',
        flagged: true,
        isSystem: false,
      });
      // второй - системное с senderId=null
      const sysCall = prisma.leadMessage.create.mock.calls[1][0];
      expect(sysCall.data).toMatchObject({
        senderId: null,
        isSystem: true,
        flagged: false,
      });
      expect(sysCall.data.content).toContain('⚠️');
      expect(res).toEqual({ id: 'm-1', flagged: true, isSystem: false });
    });
  });

  describe('listMessages', () => {
    it('403 for non-participant', async () => {
      prisma.leadDialog.findUnique.mockResolvedValue(openDialog);
      await expect(service.listMessages('stranger', 'd-1'))
        .rejects.toBeInstanceOf(ForbiddenException);
    });

    it('returns messages ordered by createdAt asc', async () => {
      prisma.leadDialog.findUnique.mockResolvedValue(openDialog);
      prisma.leadMessage.findMany.mockResolvedValue([]);
      await service.listMessages('creator', 'd-1');
      expect(prisma.leadMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { dialogId: 'd-1' },
          orderBy: { createdAt: 'asc' },
        }),
      );
    });
  });
});
