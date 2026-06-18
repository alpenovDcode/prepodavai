import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../admin/guards/admin.guard';
import {
  CreateSmartLinkDto,
  SmartLinksService,
  UpdateSmartLinkDto,
} from './smart-links.service';

const ANON_COOKIE = 'prv_anon';
const ANON_COOKIE_MAX_AGE = 365 * 24 * 60 * 60 * 1000; // 1 год

// ──────── Публичный редирект ────────

@Controller()
export class SmartLinksRedirectController {
  constructor(private readonly service: SmartLinksService) {}

  /**
   * GET /g/:slug — публичная короткая ссылка.
   * Резолвит slug, инкрементит клик, ставит anon-cookie если её ещё нет,
   * и 302-редиректит на финальный URL с подмешанными UTM-параметрами.
   * Если slug не найден — 302 на корень сайта.
   */
  @Get('g/:slug')
  async redirect(
    @Param('slug') slug: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    let anonId = req.cookies?.[ANON_COOKIE] as string | undefined;
    if (!anonId) {
      anonId = this.service.generateAnonId();
      res.cookie(ANON_COOKIE, anonId, {
        maxAge: ANON_COOKIE_MAX_AGE,
        httpOnly: false, // фронту тоже полезно — для трекинга на лендинге
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
      });
    }

    const userId = (req as any).user?.id; // если случайно залогинен (редко)
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip ||
      undefined;

    const result = await this.service.resolveAndTrack({
      slug,
      ip,
      userAgent: req.headers['user-agent'] || undefined,
      referer: (req.headers.referer || req.headers.referrer || undefined) as string,
      anonId,
      userId,
    });

    if (!result) {
      return res.redirect(302, 'https://prepodavai.ru/?invalid_link=1');
    }

    return res.redirect(302, result.targetUrl);
  }
}

// ──────── Админ CRUD ────────

@Controller('admin/smart-links')
@UseGuards(JwtAuthGuard, AdminGuard)
export class SmartLinksAdminController {
  constructor(private readonly service: SmartLinksService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Post()
  create(@Body() dto: CreateSmartLinkDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSmartLinkDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.delete(id);
  }

  @Get(':id/clicks')
  clicks(@Param('id') id: string, @Query('limit') limit?: string) {
    return this.service.recentClicks(id, limit ? parseInt(limit, 10) : 50);
  }
}
