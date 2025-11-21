import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { LogsService } from './logs.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('logs')
export class LogsController {
  constructor(private readonly logsService: LogsService) {}

  @Post()
  async saveLog(@Body() body: any) {
    return this.logsService.saveLog(body);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  async getLogs(
    @Query('level') level?: string,
    @Query('category') category?: string,
    @Query('userId') userId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.logsService.getLogs({
      level,
      category,
      userId,
      limit: limit ? parseInt(limit) : 50,
      offset: offset ? parseInt(offset) : 0,
    });
  }
}

