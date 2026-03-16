import { Controller, Post, Body, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { Response } from 'express';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  private setTokenCookie(res: Response, token: string) {
    res.cookie('prepodavai_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
  }

  @Post('validate-init-data')
  async validateInitData(@Body() body: { initData: string }, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.validateTelegramInitData(body.initData);
    if (result && result.token) {
      this.setTokenCookie(res, result.token);
    }
    return result;
  }

  @Post('login-with-api-key')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async loginWithApiKey(@Body() body: { username: string; apiKey: string }, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.loginWithApiKey(body.username, body.apiKey);
    if (result && result.token) {
      this.setTokenCookie(res, result.token);
    }
    return result;
  }

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async login(@Body() body: { username: string; pass: string }, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.login(body.username, body.pass);
    if (result && result.token) {
      this.setTokenCookie(res, result.token);
    }
    return result;
  }

  @Post('student-login')
  async studentLogin(@Body() body: { accessCode: string }, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.studentLogin(body.accessCode);
    if (result && result.token) {
      this.setTokenCookie(res, result.token);
    }
    return result;
  }

  @Post('phone/send-code')
  @Throttle({ default: { limit: 3, ttl: 60000 } }) // Even stricter for SMS sending
  async sendPhoneVerificationCode(@Body() body: { phone: string }) {
    return this.authService.sendPhoneVerificationCode(body.phone);
  }

  @Post('phone/login')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async loginWithPhone(@Body() body: { phone: string; code: string }, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.loginWithPhone(body.phone, body.code);
    if (result && result.token) {
      this.setTokenCookie(res, result.token);
    }
    return result;
  }
}
