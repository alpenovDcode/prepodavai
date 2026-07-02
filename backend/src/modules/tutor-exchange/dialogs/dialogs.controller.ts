import {
  BadRequestException,
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
import { CreateDialogDto } from './dto/create-dialog.dto';
import { DialogAction, DialogActionDto } from './dto/action.dto';

@Controller('tutor-exchange/dialogs')
@UseGuards(JwtAuthGuard, ExchangeEnabledGuard)
export class DialogsController {
  constructor(private readonly dialogsService: DialogsService) {}

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
    if (body.action === DialogAction.CANCEL) {
      return this.dialogsService.cancelDialog(req.user.id, id);
    }
    throw new BadRequestException('Неизвестное действие');
  }
}
