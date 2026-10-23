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
import { MessagesService } from './messages.service';
import { SendMessageDto } from './dto/send-message.dto';

@Controller('tutor-exchange/dialogs/:dialogId/messages')
@UseGuards(JwtAuthGuard, ExchangeEnabledGuard)
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get()
  list(@Request() req: any, @Param('dialogId') dialogId: string) {
    return this.messagesService.listMessages(req.user.id, dialogId);
  }

  @Post()
  send(@Request() req: any, @Param('dialogId') dialogId: string, @Body() body: SendMessageDto) {
    return this.messagesService.sendMessage(req.user.id, dialogId, body);
  }
}
