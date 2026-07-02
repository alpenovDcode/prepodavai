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
import { ExchangeEnabledGuard } from '../guards/exchange-enabled.guard';
import { DialogsService } from './dialogs.service';
import { DialogActionsService } from './dialog-actions.service';
import { CreateDialogDto } from './dto/create-dialog.dto';
import { DialogActionDto } from './dto/action.dto';

@Controller('tutor-exchange/dialogs')
@UseGuards(JwtAuthGuard, ExchangeEnabledGuard)
export class DialogsController {
  constructor(
    private readonly dialogsService: DialogsService,
    private readonly actions: DialogActionsService,
  ) {}

  @Get()
  list(@Request() req: any) {
    return this.dialogsService.listMyDialogs(req.user.id);
  }

  @Get(':id')
  getOne(@Request() req: any, @Param('id') id: string) {
    return this.dialogsService.getDialog(req.user.id, id);
  }

  @Post()
  create(@Request() req: any, @Body() body: CreateDialogDto) {
    return this.dialogsService.createDialog(req.user.id, body);
  }

  @Post(':id/actions')
  action(@Request() req: any, @Param('id') id: string, @Body() body: DialogActionDto) {
    return this.actions.transition(req.user.id, id, body.action, {
      trialLessonLink: body.trialLessonLink,
    });
  }
}
