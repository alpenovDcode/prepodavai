import {
  Controller,
  Get,
  Post,
  Param,
  Request,
  UseGuards,
} from '@nestjs/common';
import { PopupsService } from './popups.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

/**
 * Эндпоинты для пользователей. Админский CRUD живёт отдельно
 * (admin-popups.controller).
 */
@Controller('popups')
@UseGuards(JwtAuthGuard)
export class PopupsController {
  constructor(private readonly popupsService: PopupsService) {}

  @Get('active')
  async getActive(@Request() req: any) {
    const userId = req.user?.role === 'student' ? req.user?.teacherId : req.user?.id;
    if (!userId) return null;
    return this.popupsService.getActivePopupForUser(userId);
  }

  @Post(':id/dismiss')
  async dismiss(@Request() req: any, @Param('id') id: string) {
    const userId = req.user?.role === 'student' ? req.user?.teacherId : req.user?.id;
    return this.popupsService.dismissPopup(id, userId);
  }
}
