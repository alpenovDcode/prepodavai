import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';

const KEY_ENABLED = 'maintenance.enabled';
const KEY_MESSAGE = 'maintenance.message';
const DEFAULT_MESSAGE = 'Сервис временно не доступен. Ведутся технические работы';

export interface MaintenanceStatus {
  enabled: boolean;
  message: string;
  updatedAt: Date | null;
}

const TOOL_DEFAULT_MESSAGES: Record<string, string> = {
  tutor_exchange: 'Биржа лидов скоро откроется — мы обкатываем последние детали',
};
const TOOL_FALLBACK_MESSAGE = 'Инструмент временно недоступен';

export interface ToolStatus {
  enabled: boolean;
  message: string;
  updatedAt: Date | null;
}

function toolKeys(opKey: string) {
  return {
    enabled: `tools.${opKey}.enabled`,
    message: `tools.${opKey}.message`,
  };
}

@Injectable()
export class SystemService {
  private readonly logger = new Logger(SystemService.name);

  // Кэш статуса для middleware — иначе каждое API-обращение читает БД.
  // 10 секунд — приемлемая задержка отражения переключения.
  private cache: { status: MaintenanceStatus; expiresAt: number } | null = null;
  private static readonly CACHE_TTL_MS = 10_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /** Список admin user IDs из env (тот же источник, что и AdminGuard). */
  getAdminUserIds(): string[] {
    return this.configService
      .get<string>('ADMIN_USER_IDS', '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  isAdminUserId(userId?: string | null): boolean {
    if (!userId) return false;
    return this.getAdminUserIds().includes(userId);
  }

  async getMaintenanceStatus(force = false): Promise<MaintenanceStatus> {
    const now = Date.now();
    if (!force && this.cache && this.cache.expiresAt > now) return this.cache.status;

    const rows = await (this.prisma as any).systemSetting.findMany({
      where: { key: { in: [KEY_ENABLED, KEY_MESSAGE] } },
    });
    const enabledRow = rows.find((r: any) => r.key === KEY_ENABLED);
    const messageRow = rows.find((r: any) => r.key === KEY_MESSAGE);

    const status: MaintenanceStatus = {
      enabled: enabledRow?.value === 'true',
      message: messageRow?.value || DEFAULT_MESSAGE,
      updatedAt: enabledRow?.updatedAt ?? messageRow?.updatedAt ?? null,
    };
    this.cache = { status, expiresAt: now + SystemService.CACHE_TTL_MS };
    return status;
  }

  async setMaintenance(
    enabled: boolean,
    message: string | undefined,
    adminId: string,
  ): Promise<MaintenanceStatus> {
    const ops: Promise<any>[] = [
      (this.prisma as any).systemSetting.upsert({
        where: { key: KEY_ENABLED },
        update: { value: enabled ? 'true' : 'false', updatedBy: adminId },
        create: { key: KEY_ENABLED, value: enabled ? 'true' : 'false', updatedBy: adminId },
      }),
    ];
    if (message !== undefined) {
      const trimmed = (message ?? '').slice(0, 1000);
      ops.push(
        (this.prisma as any).systemSetting.upsert({
          where: { key: KEY_MESSAGE },
          update: { value: trimmed || null, updatedBy: adminId },
          create: { key: KEY_MESSAGE, value: trimmed || null, updatedBy: adminId },
        }),
      );
    }
    await Promise.all(ops);
    this.cache = null; // сбрасываем кэш
    this.logger.warn(
      `[Maintenance] toggled by admin=${adminId}: enabled=${enabled}` +
        (message !== undefined ? ` message="${message}"` : ''),
    );
    return this.getMaintenanceStatus(true);
  }

  // Per-tool cache: opKey → { status, expiresAt }
  private toolCache = new Map<string, { status: ToolStatus; expiresAt: number }>();

  async getToolStatus(opKey: string, force = false): Promise<ToolStatus> {
    const now = Date.now();
    const cached = this.toolCache.get(opKey);
    if (!force && cached && cached.expiresAt > now) return cached.status;

    const keys = toolKeys(opKey);
    const rows = await (this.prisma as any).systemSetting.findMany({
      where: { key: { in: [keys.enabled, keys.message] } },
    });
    const enabledRow = rows.find((r: any) => r.key === keys.enabled);
    const messageRow = rows.find((r: any) => r.key === keys.message);

    const status: ToolStatus = {
      enabled: enabledRow?.value === 'true',
      message:
        messageRow?.value ||
        TOOL_DEFAULT_MESSAGES[opKey] ||
        TOOL_FALLBACK_MESSAGE,
      updatedAt: enabledRow?.updatedAt ?? messageRow?.updatedAt ?? null,
    };
    this.toolCache.set(opKey, {
      status,
      expiresAt: now + SystemService.CACHE_TTL_MS,
    });
    return status;
  }

  async setToolStatus(
    opKey: string,
    patch: { enabled: boolean; message?: string },
    adminId: string,
  ): Promise<ToolStatus> {
    const keys = toolKeys(opKey);
    const ops: Promise<any>[] = [
      (this.prisma as any).systemSetting.upsert({
        where: { key: keys.enabled },
        update: { value: patch.enabled ? 'true' : 'false', updatedBy: adminId },
        create: {
          key: keys.enabled,
          value: patch.enabled ? 'true' : 'false',
          updatedBy: adminId,
        },
      }),
    ];
    if (patch.message !== undefined) {
      const trimmed = (patch.message ?? '').slice(0, 1000);
      ops.push(
        (this.prisma as any).systemSetting.upsert({
          where: { key: keys.message },
          update: { value: trimmed || null, updatedBy: adminId },
          create: {
            key: keys.message,
            value: trimmed || null,
            updatedBy: adminId,
          },
        }),
      );
    }
    await Promise.all(ops);
    this.toolCache.delete(opKey);
    this.logger.warn(
      `[Tool ${opKey}] toggled by admin=${adminId}: enabled=${patch.enabled}` +
        (patch.message !== undefined ? ` message="${patch.message}"` : ''),
    );
    return this.getToolStatus(opKey, true);
  }
}
