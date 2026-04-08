import { Controller, Post, Get, Delete, Body, Res, Request, Query, Param, Logger, UseGuards } from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Response } from 'express';
import {
  ValidateInitDataDto,
  LoginWithApiKeyDto,
  LoginDto,
  StudentLoginDto,
  SendPhoneCodeDto,
  LoginWithPhoneDto,
  RegisterByEmailDto,
  VerifyEmailCodeDto,
  GenerateLinkTokenDto,
} from './dto/auth.dto';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}

  private setTokenCookie(res: Response, token: string, req: any) {
    const host = req.get('host') || '';
    const isPrepodavaiDomain = host.endsWith('prepodavai.ru');
    const isProduction = process.env.NODE_ENV === 'production' || isPrepodavaiDomain;

    // Clear any old cookies (without domain) to prevent duplicate cookies in browser
    res.clearCookie('prepodavai_token', { path: '/' });
    if (isProduction) {
      res.clearCookie('prepodavai_token', { path: '/', domain: '.prepodavai.ru' });
    }

    res.cookie('prepodavai_token', token, {
      httpOnly: true,
      secure: isProduction || req.secure || req.header('x-forwarded-proto') === 'https',
      sameSite: isProduction ? 'lax' : 'none',
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/',
      domain: isProduction ? '.prepodavai.ru' : undefined,
    });

    if (!isProduction) {
      console.debug(`[AuthController] Cookie set. Prod: ${isProduction}, Host: ${host}`);
    }
  }

  @Post('logout')
  async logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('prepodavai_token', {
      httpOnly: true,
      path: '/',
    });
    return { success: true };
  }

  @Post('validate-init-data')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async validateInitData(
    @Body() body: ValidateInitDataDto,
    @Res({ passthrough: true }) res: Response,
    @Request() req: any,
  ) {
    const result = await this.authService.validateTelegramInitData(body.initData);
    if (result && result.token) {
      this.setTokenCookie(res, result.token, req);
    }
    return result;
  }

  @Post('max/ott')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async loginWithMaxOtt(
    @Body() body: { token: string },
    @Res({ passthrough: true }) res: Response,
    @Request() req: any,
  ) {
    this.logger.log(`[MAX Mini App] OTT login attempt`);
    const result = await this.authService.validateMaxOtt(body.token);
    if (result?.token) {
      this.logger.log(`[MAX Mini App] OTT login success | user: ${result.user?.username}`);
      this.setTokenCookie(res, result.token, req);
    }
    return result;
  }

  @Post('max/validate-init-data')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async validateMaxInitData(
    @Body() body: ValidateInitDataDto,
    @Res({ passthrough: true }) res: Response,
    @Request() req: any,
  ) {
    const hasInitData = !!(body.initData && body.initData.length > 0);
    this.logger.log(
      `[MAX Mini App] Попытка открытия мини-приложения | initData: ${hasInitData ? `есть (${body.initData?.length} символов)` : 'отсутствует'} | IP: ${req.ip}`,
    );
    const result = await this.authService.validateMaxInitData(body.initData);
    if (result && result.token) {
      this.logger.log(`[MAX Mini App] Авторизация успешна | user: ${result.user?.username || result.user?.id}`);
      this.setTokenCookie(res, result.token, req);
    } else {
      this.logger.warn(`[MAX Mini App] Авторизация не удалась | initData присутствует: ${hasInitData}`);
    }
    return result;
  }

  @Post('login-with-api-key')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async loginWithApiKey(
    @Body() body: LoginWithApiKeyDto,
    @Res({ passthrough: true }) res: Response,
    @Request() req: any,
  ) {
    const result = await this.authService.loginWithApiKey(body.username, body.apiKey);
    if (result && result.token) {
      this.setTokenCookie(res, result.token, req);
    }
    return result;
  }

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async login(
    @Body() body: LoginDto,
    @Res({ passthrough: true }) res: Response,
    @Request() req: any,
  ) {
    const result = await this.authService.login(body.username, body.pass);
    if (result && result.token) {
      this.setTokenCookie(res, result.token, req);
    }
    return result;
  }

  @Post('student-login')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async studentLogin(
    @Body() body: StudentLoginDto,
    @Res({ passthrough: true }) res: Response,
    @Request() req: any,
  ) {
    const result = await this.authService.studentLogin(body.accessCode);
    if (result && result.token) {
      this.setTokenCookie(res, result.token, req);
    }
    return result;
  }

  @Post('student-login-email')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async studentLoginWithEmail(
    @Body() body: { email: string; password: string },
    @Res({ passthrough: true }) res: Response,
    @Request() req: any,
  ) {
    const result = await this.authService.studentLoginWithEmail(body.email, body.password);
    if (result && result.token) {
      this.setTokenCookie(res, result.token, req);
    }
    return result;
  }

  @Post('register-by-email')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async registerByEmail(@Body() body: RegisterByEmailDto) {
    return this.authService.registerByEmail(body.email);
  }

  @Post('verify-email-code')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async verifyEmailCode(
    @Body() body: VerifyEmailCodeDto,
    @Res({ passthrough: true }) res: Response,
    @Request() req: any,
  ) {
    const result = await this.authService.verifyEmailCode(body.email, body.code, body.firstName);
    if (result && result.token) {
      this.setTokenCookie(res, result.token, req);
    }
    return result;
  }

  @Post('phone/send-code')
  @Throttle({ default: { limit: 3, ttl: 60000 } }) // Even stricter for SMS sending
  async sendPhoneVerificationCode(@Body() body: SendPhoneCodeDto) {
    return this.authService.sendPhoneVerificationCode(body.phone);
  }

  @Post('phone/login')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async loginWithPhone(
    @Body() body: LoginWithPhoneDto,
    @Res({ passthrough: true }) res: Response,
    @Request() req: any,
  ) {
    const result = await this.authService.loginWithPhone(body.phone, body.code);
    if (result && result.token) {
      this.setTokenCookie(res, result.token, req);
    }
    return result;
  }

  // ========== Platform Linking ==========

  @Post('link-token')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async generateLinkToken(@Request() req: any, @Body() body: GenerateLinkTokenDto) {
    return this.authService.generateLinkToken(req.user.id, body.platform);
  }

  @Get('link-status')
  @UseGuards(JwtAuthGuard)
  @SkipThrottle()
  async getLinkStatus(@Request() req: any, @Query('token') token: string) {
    return this.authService.getLinkTokenStatus(token, req.user.id);
  }

  @Delete('unlink/:platform')
  @UseGuards(JwtAuthGuard)
  async unlinkPlatform(@Request() req: any, @Param('platform') platform: string) {
    return this.authService.unlinkPlatform(req.user.id, platform);
  }

  @Get('platforms')
  @UseGuards(JwtAuthGuard)
  async getUserPlatforms(@Request() req: any) {
    return this.authService.getUserPlatforms(req.user.id);
  }
}
