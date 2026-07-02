import { Test, TestingModule } from '@nestjs/testing';
import {
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ViolationsService } from './violations.service';
import { ViolationStatus } from './dto/update-violation.dto';
import { PrismaService } from '../../../common/prisma/prisma.service';

describe('ViolationsService', () => {
  let service: ViolationsService;
  let prisma: {
    leadDialog: { findUnique: jest.Mock };
    violationReport: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };

  const dialog = {
    id: 'd-1',
    responderId: 'responder',
    lead: { creatorId: 'creator' },
  };

  beforeEach(async () => {
    prisma = {
      leadDialog: { findUnique: jest.fn() },
      violationReport: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ViolationsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(ViolationsService);
  });

  describe('createViolation', () => {
    it('throws NotFound if dialog is missing', async () => {
      prisma.leadDialog.findUnique.mockResolvedValue(null);
      await expect(
        service.createViolation('me', 'd-x', { description: 'x'.repeat(20) }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws Forbidden if user is not a participant', async () => {
      prisma.leadDialog.findUnique.mockResolvedValue(dialog);
      await expect(
        service.createViolation('stranger', 'd-1', { description: 'x'.repeat(20) }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('creates PENDING violation when creator reports', async () => {
      prisma.leadDialog.findUnique.mockResolvedValue(dialog);
      prisma.violationReport.create.mockResolvedValue({ id: 'v-1' });
      await service.createViolation('creator', 'd-1', { description: 'user was rude' });
      expect(prisma.violationReport.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            dialogId: 'd-1',
            reporterId: 'creator',
            status: 'PENDING',
          }),
        }),
      );
    });

    it('allows responder to report as well', async () => {
      prisma.leadDialog.findUnique.mockResolvedValue(dialog);
      prisma.violationReport.create.mockResolvedValue({ id: 'v-1' });
      await service.createViolation('responder', 'd-1', { description: 'rude reply' });
      expect(prisma.violationReport.create).toHaveBeenCalled();
    });
  });

  describe('listViolations', () => {
    it('filters by status when passed', async () => {
      prisma.violationReport.findMany.mockResolvedValue([]);
      await service.listViolations({ status: 'PENDING' });
      const call = prisma.violationReport.findMany.mock.calls[0][0];
      expect(call.where.status).toBe('PENDING');
    });

    it('no filter when status is missing', async () => {
      prisma.violationReport.findMany.mockResolvedValue([]);
      await service.listViolations({});
      const call = prisma.violationReport.findMany.mock.calls[0][0];
      expect(call.where).toEqual({});
    });
  });

  describe('updateViolation', () => {
    it('throws NotFound if violation is missing', async () => {
      prisma.violationReport.findUnique.mockResolvedValue(null);
      await expect(
        service.updateViolation('v-x', ViolationStatus.RESOLVED),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('updates status to RESOLVED', async () => {
      prisma.violationReport.findUnique.mockResolvedValue({ id: 'v-1' });
      prisma.violationReport.update.mockResolvedValue({ id: 'v-1', status: 'RESOLVED' });
      const r = await service.updateViolation('v-1', ViolationStatus.RESOLVED);
      expect(prisma.violationReport.update).toHaveBeenCalledWith({
        where: { id: 'v-1' },
        data: { status: 'RESOLVED' },
      });
      expect(r.status).toBe('RESOLVED');
    });
  });
});
