import { Test } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { TutorMarketAccessService } from './tutor-market-access.service';
import { PrismaService } from '../../../common/prisma/prisma.service';

describe('TutorMarketAccessService', () => {
  let service: TutorMarketAccessService;
  let prisma: { tutorMarketProfile: { findUnique: jest.Mock } };

  beforeEach(async () => {
    prisma = { tutorMarketProfile: { findUnique: jest.fn() } };
    const mod = await Test.createTestingModule({
      providers: [
        TutorMarketAccessService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = mod.get(TutorMarketAccessService);
  });

  it('пропускает если профиля нет', async () => {
    prisma.tutorMarketProfile.findUnique.mockResolvedValue(null);
    await expect(service.assertNotFrozen('u1')).resolves.toBeUndefined();
  });

  it('пропускает если disabledAt=null', async () => {
    prisma.tutorMarketProfile.findUnique.mockResolvedValue({ disabledAt: null });
    await expect(service.assertNotFrozen('u1')).resolves.toBeUndefined();
  });

  it('бросает Forbidden если заморожен', async () => {
    prisma.tutorMarketProfile.findUnique.mockResolvedValue({ disabledAt: new Date() });
    await expect(service.assertNotFrozen('u1')).rejects.toBeInstanceOf(ForbiddenException);
  });
});
