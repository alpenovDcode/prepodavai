import { ExecutionContext, ServiceUnavailableException } from '@nestjs/common';
import { ExchangeEnabledGuard } from './exchange-enabled.guard';

describe('ExchangeEnabledGuard', () => {
  let systemService: {
    getToolStatus: jest.Mock;
    isAdminUserId: jest.Mock;
  };
  let guard: ExchangeEnabledGuard;

  const makeCtx = (userId: string | null): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => (userId ? { user: { id: userId } } : {}),
      }),
    }) as any;

  beforeEach(() => {
    systemService = {
      getToolStatus: jest.fn(),
      isAdminUserId: jest.fn(),
    };
    guard = new ExchangeEnabledGuard(systemService as any);
  });

  it('allows request when enabled=true', async () => {
    systemService.getToolStatus.mockResolvedValue({
      enabled: true,
      message: '',
      updatedAt: null,
    });
    systemService.isAdminUserId.mockReturnValue(false);

    await expect(guard.canActivate(makeCtx('user-1'))).resolves.toBe(true);
  });

  it('allows admin even when disabled', async () => {
    systemService.getToolStatus.mockResolvedValue({
      enabled: false,
      message: 'offline',
      updatedAt: null,
    });
    systemService.isAdminUserId.mockReturnValue(true);

    await expect(guard.canActivate(makeCtx('admin-1'))).resolves.toBe(true);
  });

  it('throws 503 for non-admin when disabled', async () => {
    systemService.getToolStatus.mockResolvedValue({
      enabled: false,
      message: 'offline reason',
      updatedAt: null,
    });
    systemService.isAdminUserId.mockReturnValue(false);

    await expect(guard.canActivate(makeCtx('user-1'))).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('includes tutorExchangeDisabled marker in the exception body', async () => {
    systemService.getToolStatus.mockResolvedValue({
      enabled: false,
      message: 'offline reason',
      updatedAt: null,
    });
    systemService.isAdminUserId.mockReturnValue(false);

    try {
      await guard.canActivate(makeCtx('user-1'));
      throw new Error('should not reach here');
    } catch (err: any) {
      expect(err.getResponse()).toEqual({
        tutorExchangeDisabled: true,
        message: 'offline reason',
      });
    }
  });
});
