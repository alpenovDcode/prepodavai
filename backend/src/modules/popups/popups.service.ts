import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreatePopupDto, UpdatePopupDto } from './dto/popup.dto';

@Injectable()
export class PopupsService {
  private readonly logger = new Logger(PopupsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── Пользовательская часть ───────────────────────────────────────────────
  /**
   * Возвращает один активный popup для пользователя с наибольшим priority,
   * либо null. Учитывает: isActive, текущий диапазон [startsAt, endsAt] и
   * dismissals (пользователь уже закрывал).
   */
  async getActivePopupForUser(userId: string) {
    const now = new Date();
    const popups = await (this.prisma as any).dashboardPopup.findMany({
      where: {
        isActive: true,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        ],
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      take: 20,
    });
    if (!popups.length) return null;

    const dismissed = await (this.prisma as any).dashboardPopupDismissal.findMany({
      where: { userId, popupId: { in: popups.map((p: any) => p.id) } },
      select: { popupId: true },
    });
    const dismissedIds = new Set(dismissed.map((d: any) => d.popupId));
    const next = popups.find((p: any) => !dismissedIds.has(p.id));
    return next ?? null;
  }

  async dismissPopup(popupId: string, userId: string) {
    // Идемпотентно: если уже закрывал — просто возвращаем success.
    await (this.prisma as any).dashboardPopupDismissal.upsert({
      where: { popupId_userId: { popupId, userId } },
      update: {},
      create: { popupId, userId },
    });
    return { success: true };
  }

  // ── Админ-часть ──────────────────────────────────────────────────────────
  async listAll() {
    return (this.prisma as any).dashboardPopup.findMany({
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async create(adminId: string, dto: CreatePopupDto) {
    return (this.prisma as any).dashboardPopup.create({
      data: {
        title: dto.title ?? null,
        body: dto.body,
        ctaText: dto.ctaText ?? null,
        ctaUrl: dto.ctaUrl ?? null,
        delaySeconds: dto.delaySeconds ?? 5,
        isActive: dto.isActive ?? true,
        priority: dto.priority ?? 0,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
        createdBy: adminId,
      },
    });
  }

  async update(id: string, dto: UpdatePopupDto) {
    const existing = await (this.prisma as any).dashboardPopup.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Popup not found');

    const data: any = {};
    if (dto.title !== undefined) data.title = dto.title || null;
    if (dto.body !== undefined) data.body = dto.body;
    if (dto.ctaText !== undefined) data.ctaText = dto.ctaText || null;
    if (dto.ctaUrl !== undefined) data.ctaUrl = dto.ctaUrl || null;
    if (dto.delaySeconds !== undefined) data.delaySeconds = dto.delaySeconds;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.priority !== undefined) data.priority = dto.priority;
    if (dto.startsAt !== undefined) data.startsAt = dto.startsAt ? new Date(dto.startsAt) : null;
    if (dto.endsAt !== undefined) data.endsAt = dto.endsAt ? new Date(dto.endsAt) : null;

    return (this.prisma as any).dashboardPopup.update({ where: { id }, data });
  }

  async remove(id: string) {
    await (this.prisma as any).dashboardPopup.delete({ where: { id } });
    return { success: true };
  }
}
