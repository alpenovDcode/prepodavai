import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../../admin/guards/admin.guard';
import { DisputeService } from './dispute.service';
import { ResolveDisputeDto } from './dto/resolve-dispute.dto';

/**
 * Админские действия над спорами биржи. Отдельный контроллер под
 * AdminGuard — клиентские действия участников живут в DialogsController.
 */
@Controller('admin/tutor-exchange')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminDisputeController {
  constructor(private readonly disputes: DisputeService) {}

  @Get('disputes')
  list() {
    return this.disputes.listDisputes();
  }

  @Post('dialogs/:dialogId/resolve')
  resolve(
    @Request() req: any,
    @Param('dialogId') dialogId: string,
    @Body() body: ResolveDisputeDto,
  ) {
    return this.disputes.resolveDispute(req.user.id, dialogId, body);
  }

  @Post('tutors/:userId/unfreeze')
  unfreeze(@Param('userId') userId: string) {
    return this.disputes.unfreezeTutor(userId);
  }
}
