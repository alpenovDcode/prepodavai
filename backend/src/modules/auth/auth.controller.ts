import { Controller, Post, Body } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  @Post('validate-init-data')
  async validateInitData(@Body() body: { initData: string }) {
    return this.authService.validateTelegramInitData(body.initData);
  }

  @Post('login-with-api-key')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async loginWithApiKey(@Body() body: { username: string; apiKey: string }) {
    return this.authService.loginWithApiKey(body.username, body.apiKey);
  }

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async login(@Body() body: { username: string; pass: string }) {
    return this.authService.login(body.username, body.pass);
  }

  @Post('phone/send-code')
  @Throttle({ default: { limit: 3, ttl: 60000 } }) // Even stricter for SMS sending
  async sendPhoneVerificationCode(@Body() body: { phone: string }) {
    return this.authService.sendPhoneVerificationCode(body.phone);
  }

  @Post('phone/login')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async loginWithPhone(@Body() body: { phone: string; code: string }) {
    return this.authService.loginWithPhone(body.phone, body.code);
  }
}
