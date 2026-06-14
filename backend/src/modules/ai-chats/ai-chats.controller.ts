import {
  Controller, Get, Post, Delete, Param, Body, Request, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AiChatsService } from './ai-chats.service';
import { SendMessageDto } from './dto/ai-chats.dto';

@Controller('ai-chats')
@UseGuards(JwtAuthGuard)
export class AiChatsController {
  constructor(private readonly aiChatsService: AiChatsService) {}

  @Get()
  list(@Request() req) {
    return this.aiChatsService.listChats(req.user.id);
  }

  @Post()
  create(@Request() req) {
    return this.aiChatsService.createChat(req.user.id);
  }

  @Get(':id')
  getOne(@Request() req, @Param('id') id: string) {
    return this.aiChatsService.getChat(req.user.id, id);
  }

  @Post(':id/messages')
  sendMessage(@Request() req, @Param('id') id: string, @Body() dto: SendMessageDto) {
    return this.aiChatsService.sendMessage(req.user.id, id, dto);
  }

  @Post(':id/messages/:msgId/regenerate')
  regenerate(@Request() req, @Param('id') id: string, @Param('msgId') msgId: string) {
    return this.aiChatsService.regenerate(req.user.id, id, msgId);
  }

  @Delete(':id')
  deleteChat(@Request() req, @Param('id') id: string) {
    return this.aiChatsService.deleteChat(req.user.id, id);
  }
}
