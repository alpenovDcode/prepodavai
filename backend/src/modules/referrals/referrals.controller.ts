import { Controller, Get, Post, Body, Query, UseGuards, Request } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ReferralsService } from './referrals.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateReferralCodeDto } from './dto/create-referral-code.dto';
import { ApplyReferralCodeDto } from './dto/apply-referral-code.dto';

@Controller('referrals')
@UseGuards(JwtAuthGuard)
export class ReferralsController {
  constructor(private readonly referralsService: ReferralsService) {}

  /**
   * Создать или получить свой реферальный код
   */
  @Post('code')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async createOrGetCode(@Request() req, @Body() body: CreateReferralCodeDto) {
    const code = await this.referralsService.getOrCreateReferralCode(
      req.user.id,
      body.customCode,
    );

    return {
      success: true,
      referralCode: {
        code: code.code,
        link: `https://prepodavai.ru/ref/${code.code}`,
        usageCount: code.usageCount,
        isActive: code.isActive,
        createdAt: code.createdAt,
      },
    };
  }

  /**
   * Получить свой реферальный код
   */
  @Get('code')
  async getCode(@Request() req) {
    const code = await this.referralsService.getReferralCode(req.user.id);

    if (!code) {
      return { success: true, referralCode: null };
    }

    return {
      success: true,
      referralCode: {
        code: code.code,
        link: `https://prepodavai.ru/ref/${code.code}`,
        usageCount: code.usageCount,
        isActive: code.isActive,
        createdAt: code.createdAt,
      },
    };
  }

  /**
   * Применить реферальный код (вызывается после регистрации)
   */
  @Post('apply')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async applyCode(@Request() req, @Body() body: ApplyReferralCodeDto) {
    const userType = req.user.role === 'student' ? 'student' : 'teacher';
    const referral = await this.referralsService.applyReferralCode(
      req.user.id,
      userType,
      body.code,
    );

    return {
      success: true,
      referral: {
        id: referral.id,
        status: referral.status,
        referralType: referral.referralType,
      },
    };
  }

  /**
   * Статистика рефералов
   */
  @Get('stats')
  async getStats(@Request() req) {
    const stats = await this.referralsService.getReferralStats(req.user.id);
    return { success: true, stats };
  }

  /**
   * Список рефералов с пагинацией
   */
  @Get('list')
  async getList(
    @Request() req,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const referrals = await this.referralsService.getReferralsList(
      req.user.id,
      limit ? parseInt(limit, 10) : undefined,
      offset ? parseInt(offset, 10) : undefined,
    );
    return { success: true, referrals };
  }
}
