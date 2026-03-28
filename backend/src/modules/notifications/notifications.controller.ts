import { Controller, Get, Patch, Param, UseGuards, Request } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  // Teacher notifications (JWT user = AppUser)
  @Get('teacher')
  getTeacherNotifications(@Request() req) {
    return this.notificationsService.getNotifications(req.user.id, 'teacher');
  }

  @Get('teacher/unread-count')
  getTeacherUnreadCount(@Request() req) {
    return this.notificationsService.getUnreadCount(req.user.id, 'teacher');
  }

  @Patch('teacher/mark-all-read')
  markAllTeacherRead(@Request() req) {
    return this.notificationsService.markAllAsRead(req.user.id, 'teacher');
  }

  @Patch('teacher/:id/read')
  markTeacherRead(@Request() req, @Param('id') id: string) {
    return this.notificationsService.markAsRead(req.user.id, 'teacher', id);
  }

  // Student notifications — studentId taken from JWT (req.user.id), not from query param
  @Get('student')
  getStudentNotifications(@Request() req) {
    return this.notificationsService.getNotifications(req.user.id, 'student');
  }

  @Get('student/unread-count')
  getStudentUnreadCount(@Request() req) {
    return this.notificationsService.getUnreadCount(req.user.id, 'student');
  }

  @Patch('student/mark-all-read')
  markAllStudentRead(@Request() req) {
    return this.notificationsService.markAllAsRead(req.user.id, 'student');
  }

  @Patch('student/:id/read')
  markStudentRead(@Request() req, @Param('id') id: string) {
    return this.notificationsService.markAsRead(req.user.id, 'student', id);
  }
}
