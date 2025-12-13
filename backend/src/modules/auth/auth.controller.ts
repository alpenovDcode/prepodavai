import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  @Post('validate-init-data')
  async validateInitData(@Body() body: { initData: string }) {
    return this.authService.validateTelegramInitData(body.initData);
  }

  @Post('login-with-api-key')
  async loginWithApiKey(@Body() body: { username: string; apiKey: string }) {
    return this.authService.loginWithApiKey(body.username, body.apiKey);
  }

  @Post('login')
  async login(@Body() body: { username: string; pass: string }) {
    return this.authService.login(body.username, body.pass);
  }

  @Post('phone/send-code')
  async sendPhoneVerificationCode(@Body() body: { phone: string }) {
    return this.authService.sendPhoneVerificationCode(body.phone);
  }

  @Post('phone/login')
  async loginWithPhone(@Body() body: { phone: string; code: string }) {
    return this.authService.loginWithPhone(body.phone, body.code);
  }
}
