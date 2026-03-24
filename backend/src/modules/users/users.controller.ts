import { Controller, Get, Put, Body, UseGuards, Request } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

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
        bio: user.bio,
        avatar: user.avatar,
        notifyNewCourse: user.notifyNewCourse,
        notifyStudentProgress: user.notifyStudentProgress,
        notifyWeeklyReport: user.notifyWeeklyReport,
      },
    };
  }

  @Put('me')
  @UseGuards(JwtAuthGuard)
  async updateCurrentUser(@Request() req, @Body() body: any) {
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
