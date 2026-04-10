import { Controller, Get, Put, Post, Body, UseGuards, Request } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UpdateUserDto } from './dto/update-user.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getCurrentUser(@Request() req) {
    const user = await this.usersService.findById(req.user.id);
    return {
      success: true,
      user: {
        id: user.id,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        source: user.source,
        telegramId: user.telegramId,
        email: user.email,
        phone: user.phone,
        phoneVerified: user.phoneVerified,
        bio: user.bio,
        subject: user.subject,
        grades: user.grades,
        avatar: user.avatar,
        notifyNewCourse: user.notifyNewCourse,
        notifyStudentProgress: user.notifyStudentProgress,
        notifyWeeklyReport: user.notifyWeeklyReport,
      },
    };
  }

  @Post('me/phone/send-code')
  @UseGuards(JwtAuthGuard)
  async sendPhoneVerificationCode(@Request() req, @Body() body: { phone: string }) {
    await this.usersService.sendPhoneVerificationCode(req.user.id, body.phone);
    return { success: true, message: 'SMS отправлено' };
  }

  @Post('me/phone/verify')
  @UseGuards(JwtAuthGuard)
  async verifyPhone(@Request() req, @Body() body: { phone: string; code: string }) {
    const result = await this.usersService.verifyPhoneAndGrantBonus(req.user.id, body.phone, body.code);
    return { success: true, ...result };
  }

  @Put('me')
  @UseGuards(JwtAuthGuard)
  async updateCurrentUser(@Request() req, @Body() body: UpdateUserDto) {
    const user = await this.usersService.updateProfile(req.user.id, body);
    return {
      success: true,
      user: {
        id: user.id,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        source: user.source,
        telegramId: user.telegramId,
        email: user.email,
        bio: user.bio,
        avatar: user.avatar,
        notifyNewCourse: user.notifyNewCourse,
        notifyStudentProgress: user.notifyStudentProgress,
        notifyWeeklyReport: user.notifyWeeklyReport,
      },
    };
  }
}
