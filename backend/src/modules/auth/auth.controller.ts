import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('validate-init-data')
  async validateInitData(@Body() body: { initData: string }) {
    return this.authService.validateTelegramInitData(body.initData);
  }

  @Post('login-with-api-key')
  async loginWithApiKey(@Body() body: { username: string; apiKey: string }) {
    return this.authService.loginWithApiKey(body.username, body.apiKey);
  }
}

