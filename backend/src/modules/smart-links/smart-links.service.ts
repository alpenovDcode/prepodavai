import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { randomUUID } from 'crypto';

export interface CreateSmartLinkDto {
  slug: string;
  name: string;
  targetUrl: string;
  description?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  autoTags?: string[];
  isActive?: boolean;
  expiresAt?: string | null;
}

export type UpdateSmartLinkDto = Partial<CreateSmartLinkDto>;

const SLUG_RE = /^[A-Za-z0-9_-]{1,48}$/;

@Injectable()
export class SmartLinksService {
  private readonly logger = new Logger(SmartLinksService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ──────── ADMIN ────────

  async list() {
    const links = await this.prisma.smartLink.findMany({
      orderBy: { createdAt: 'desc' },
    });
    // Считаем дополнительно конверсию
    return links.map((l) => ({
      ...l,
      conversionRate: l.clickCount > 0 ? +(l.registrations / l.clickCount * 100).toFixed(1) : 0,
    }));
  }

  async get(id: string) {
    const link = await this.prisma.smartLink.findUnique({ where: { id } });
    if (!link) throw new NotFoundException('Smart link не найден');
    return link;
  }

  async create(dto: CreateSmartLinkDto) {
    this.validateSlug(dto.slug);
    this.validateUrl(dto.targetUrl);

    // Дубль slug? Prisma выкинет P2002, но для понятного ответа проверим явно.
    const exists = await this.prisma.smartLink.findUnique({ where: { slug: dto.slug } });
    if (exists) throw new BadRequestException(`Slug "${dto.slug}" уже занят`);

    return this.prisma.smartLink.create({
      data: {
        slug: dto.slug,
        name: dto.name?.trim() || dto.slug,
        targetUrl: dto.targetUrl.trim(),
        description: dto.description?.trim() || null,
        utmSource: dto.utmSource?.trim() || null,
        utmMedium: dto.utmMedium?.trim() || null,
        utmCampaign: dto.utmCampaign?.trim() || null,
        utmContent: dto.utmContent?.trim() || null,
        utmTerm: dto.utmTerm?.trim() || null,
        autoTags: (dto.autoTags || []).map((t) => t.trim()).filter(Boolean),
        isActive: dto.isActive ?? true,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
    });
  }

  async update(id: string, dto: UpdateSmartLinkDto) {
    if (dto.slug !== undefined) this.validateSlug(dto.slug);
    if (dto.targetUrl !== undefined) this.validateUrl(dto.targetUrl);

    if (dto.slug) {
      const taken = await this.prisma.smartLink.findFirst({
        where: { slug: dto.slug, NOT: { id } },
        select: { id: true },
      });
      if (taken) throw new BadRequestException(`Slug "${dto.slug}" уже занят`);
    }

    return this.prisma.smartLink.update({
      where: { id },
      data: {
        ...(dto.slug !== undefined && { slug: dto.slug }),
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(dto.targetUrl !== undefined && { targetUrl: dto.targetUrl.trim() }),
        ...(dto.description !== undefined && { description: dto.description?.trim() || null }),
        ...(dto.utmSource !== undefined && { utmSource: dto.utmSource?.trim() || null }),
        ...(dto.utmMedium !== undefined && { utmMedium: dto.utmMedium?.trim() || null }),
        ...(dto.utmCampaign !== undefined && { utmCampaign: dto.utmCampaign?.trim() || null }),
        ...(dto.utmContent !== undefined && { utmContent: dto.utmContent?.trim() || null }),
        ...(dto.utmTerm !== undefined && { utmTerm: dto.utmTerm?.trim() || null }),
        ...(dto.autoTags !== undefined && {
          autoTags: (dto.autoTags || []).map((t) => t.trim()).filter(Boolean),
        }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.expiresAt !== undefined && {
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        }),
      },
    });
  }

  async delete(id: string) {
    await this.prisma.smartLink.delete({ where: { id } });
    return { success: true };
  }

  async recentClicks(id: string, limit = 50) {
    const link = await this.get(id);
    const clicks = await this.prisma.smartLinkClick.findMany({
      where: { linkId: link.id },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
    });
    return { link, clicks };
  }

  // ──────── ПУБЛИЧНЫЙ РЕДИРЕКТ ────────

  /**
   * Резолвит slug → финальный URL с подмешанными UTM-параметрами.
   * Регистрирует клик, инкрементит счётчики, выдаёт URL для 302 редиректа.
   * Если slug не найден/неактивен/просрочен — возвращает null, контроллер
   * сам решит, куда редиректить (например на корень сайта).
   */
  async resolveAndTrack(args: {
    slug: string;
    ip?: string;
    userAgent?: string;
    referer?: string;
    anonId?: string;
    userId?: string;
  }): Promise<{ targetUrl: string; link: { id: string; autoTags: string[] } } | null> {
    const link = await this.prisma.smartLink.findUnique({
      where: { slug: args.slug },
    });
    if (!link || !link.isActive) return null;
    if (link.expiresAt && link.expiresAt.getTime() < Date.now()) return null;

    // Считаем уникальность по (anonId или userId) — если такого клика по этой
    // ссылке ещё не было, инкрементим uniqueClicks.
    let isUnique = false;
    if (args.anonId || args.userId) {
      const prior = await this.prisma.smartLinkClick.findFirst({
        where: {
          linkId: link.id,
          OR: [
            args.userId ? { userId: args.userId } : { userId: null },
            args.anonId ? { anonId: args.anonId } : { anonId: null },
          ],
        },
        select: { id: true },
      });
      isUnique = !prior;
    }

    await Promise.all([
      this.prisma.smartLinkClick.create({
        data: {
          linkId: link.id,
          userId: args.userId || null,
          anonId: args.anonId || null,
          ip: args.ip || null,
          userAgent: args.userAgent?.slice(0, 500) || null,
          referer: args.referer || null,
        },
      }),
      this.prisma.smartLink.update({
        where: { id: link.id },
        data: {
          clickCount: { increment: 1 },
          ...(isUnique && { uniqueClicks: { increment: 1 } }),
        },
      }),
    ]).catch((e) => this.logger.warn(`smart-link click write failed: ${e?.message}`));

    return {
      targetUrl: this.appendUtm(link.targetUrl, {
        utm_source: link.utmSource,
        utm_medium: link.utmMedium,
        utm_campaign: link.utmCampaign,
        utm_content: link.utmContent,
        utm_term: link.utmTerm,
        lid: link.id, // чтобы регистрация связалась с этой ссылкой
      }),
      link: { id: link.id, autoTags: link.autoTags },
    };
  }

  /**
   * Инкрементит счётчик регистраций. Вызываем из auth.service, когда видим
   * `lid` (или `utm_source`-привязку) при создании юзера.
   */
  async trackRegistration(linkId: string) {
    try {
      await this.prisma.smartLink.update({
        where: { id: linkId },
        data: { registrations: { increment: 1 } },
      });
    } catch (e: any) {
      // Тихий промах — если linkId не существует, регистрация всё равно идёт.
      this.logger.debug(`trackRegistration miss: ${e?.message}`);
    }
  }

  // ──────── helpers ────────

  generateAnonId(): string {
    return randomUUID();
  }

  private validateSlug(slug: string) {
    if (!slug || !SLUG_RE.test(slug)) {
      throw new BadRequestException(
        'Slug должен быть 1-48 символов: латиница, цифры, дефис, подчёркивание',
      );
    }
  }

  private validateUrl(url: string) {
    if (!url || (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('/'))) {
      throw new BadRequestException('targetUrl должен начинаться с http:// или https:// (или быть относительным)');
    }
  }

  private appendUtm(url: string, params: Record<string, string | null | undefined>): string {
    const keep = Object.entries(params).filter(([, v]) => !!v) as [string, string][];
    if (!keep.length) return url;
    try {
      // Если url — абсолютный, используем URL API; иначе подкладываем base.
      const isAbs = /^https?:\/\//i.test(url);
      const u = new URL(isAbs ? url : `https://x${url.startsWith('/') ? url : '/' + url}`);
      for (const [k, v] of keep) {
        // НЕ перезаписываем уже существующие UTM в URL — приоритет у targetUrl.
        if (!u.searchParams.has(k)) u.searchParams.set(k, v);
      }
      return isAbs ? u.toString() : u.pathname + u.search + u.hash;
    } catch {
      // Фолбэк — простая склейка
      const sep = url.includes('?') ? '&' : '?';
      return url + sep + keep.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
    }
  }
}
