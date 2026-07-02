import { Test, TestingModule } from '@nestjs/testing';
import { PaymentOverdueJob } from './payment-overdue.job';
import { PrismaService } from '../../../common/prisma/prisma.service';

describe('PaymentOverdueJob', () => {
  let job: PaymentOverdueJob;
  let prisma: {
    leadDialog: { findMany: jest.Mock; updateMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      leadDialog: { findMany: jest.fn(), updateMany: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentOverdueJob,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    job = module.get(PaymentOverdueJob);
  });

  it('returns 0 when no overdue dialogs', async () => {
    prisma.leadDialog.findMany.mockResolvedValue([]);
    await expect(job.markOverdue()).resolves.toBe(0);
    expect(prisma.leadDialog.updateMany).not.toHaveBeenCalled();
  });

  it('filters PAYMENT_PENDING with paymentDeadline<now and notifiedAt=null', async () => {
    prisma.leadDialog.findMany.mockResolvedValue([]);
    await job.markOverdue();
    const where = prisma.leadDialog.findMany.mock.calls[0][0].where;
    expect(where.status).toBe('PAYMENT_PENDING');
    expect(where.paymentDeadline).toEqual({ lt: expect.any(Date) });
    expect(where.paymentOverdueNotifiedAt).toBeNull();
  });

  it('marks all overdue dialogs with paymentOverdueNotifiedAt', async () => {
    prisma.leadDialog.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
    prisma.leadDialog.updateMany.mockResolvedValue({ count: 2 });
    const n = await job.markOverdue();
    expect(n).toBe(2);
    expect(prisma.leadDialog.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['a', 'b'] } },
        data: expect.objectContaining({ paymentOverdueNotifiedAt: expect.any(Date) }),
      }),
    );
  });
});
