import { Controller, Post, Body, Res, Request } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { Response } from 'express';
import {
  ValidateInitDataDto,
  LoginWithApiKeyDto,
  LoginDto,
  StudentLoginDto,
  SendPhoneCodeDto,
  LoginWithPhoneDto,
} from './dto/auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private setTokenCookie(res: Response, token: string, req: any) {
    const isProd = process.env.NODE_ENV === 'production';

    res.cookie('prepodavai_token', token, {
      httpOnly: true,
      secure: isProd, // HTTPS only в проде
      sameSite: 'lax', // lax достаточно для поддоменов
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/',
      domain: isProd ? '.prepodavai.ru' : undefined, // Общий домен для куки
    });
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

  @Post('max/validate-init-data')
  async validateMaxInitData(
    @Body() body: ValidateInitDataDto,
    @Res({ passthrough: true }) res: Response,
    @Request() req: any,
  ) {
    const result = await this.authService.validateMaxInitData(body.initData);
    if (result && result.token) {
      this.setTokenCookie(res, result.token, req);
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
}
