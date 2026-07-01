import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SystemService } from './system.service';
import { PrismaService } from '../../common/prisma/prisma.service';

describe('SystemService tool-status', () => {
  let service: SystemService;
  let prisma: {
    systemSetting: {
      findMany: jest.Mock;
      upsert: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      systemSetting: {
        findMany: jest.fn(),
        upsert: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SystemService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('') },
        },
      ],
    }).compile();

    service = module.get(SystemService);
  });

  describe('getToolStatus', () => {
    it('returns default disabled state for tutor_exchange when no rows', async () => {
      prisma.systemSetting.findMany.mockResolvedValue([]);
      const status = await service.getToolStatus('tutor_exchange');
      expect(status.enabled).toBe(false);
      expect(status.message).toBe(
        'Биржа лидов скоро откроется — мы обкатываем последние детали',
      );
      expect(prisma.systemSetting.findMany).toHaveBeenCalledWith({
        where: {
          key: {
            in: ['tools.tutor_exchange.enabled', 'tools.tutor_exchange.message'],
          },
        },
      });
    });

    it('returns enabled=true when SystemSetting row says so', async () => {
      prisma.systemSetting.findMany.mockResolvedValue([
        {
          key: 'tools.tutor_exchange.enabled',
          value: 'true',
          updatedAt: new Date('2026-07-02T10:00:00Z'),
        },
      ]);
      const status = await service.getToolStatus('tutor_exchange');
      expect(status.enabled).toBe(true);
    });

    it('uses fallback message for unknown opKey', async () => {
      prisma.systemSetting.findMany.mockResolvedValue([]);
      const status = await service.getToolStatus('some_other_tool');
      expect(status.message).toBe('Инструмент временно недоступен');
    });

    it('caches result within TTL', async () => {
      prisma.systemSetting.findMany.mockResolvedValue([]);
      await service.getToolStatus('tutor_exchange');
      await service.getToolStatus('tutor_exchange');
      expect(prisma.systemSetting.findMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('setToolStatus', () => {
    it('upserts enabled flag and refreshes cache', async () => {
      prisma.systemSetting.upsert.mockResolvedValue({});
      prisma.systemSetting.findMany.mockResolvedValue([
        {
          key: 'tools.tutor_exchange.enabled',
          value: 'true',
          updatedAt: new Date(),
        },
      ]);

      const status = await service.setToolStatus(
        'tutor_exchange',
        { enabled: true },
        'admin-42',
      );

      expect(prisma.systemSetting.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { key: 'tools.tutor_exchange.enabled' },
          update: { value: 'true', updatedBy: 'admin-42' },
          create: {
            key: 'tools.tutor_exchange.enabled',
            value: 'true',
            updatedBy: 'admin-42',
          },
        }),
      );
      expect(status.enabled).toBe(true);
    });

    it('upserts message when provided', async () => {
      prisma.systemSetting.upsert.mockResolvedValue({});
      prisma.systemSetting.findMany.mockResolvedValue([]);

      await service.setToolStatus(
        'tutor_exchange',
        { enabled: false, message: 'Привет' },
        'admin-42',
      );

      const calls = prisma.systemSetting.upsert.mock.calls.map(
        (c: any[]) => c[0].where.key,
      );
      expect(calls).toContain('tools.tutor_exchange.message');
    });
  });
});
