import { Controller, Post, Body, Get, Param, Res, UseGuards, Req } from '@nestjs/common';
import { Response } from 'express';
import { GamesService } from './games.service';
import { CreateGameDto } from './dto/create-game.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('games')
export class GamesController {
  constructor(private readonly gamesService: GamesService) {}

  @Post('generate')
  @UseGuards(JwtAuthGuard)
  async generate(@Body() createGameDto: CreateGameDto, @Req() req) {
    return this.gamesService.generateGame(createGameDto, req.user.userId);
  }

  @Get(':id')
  async play(@Param('id') id: string, @Res() res: Response) {
    const fileBuffer = await this.gamesService.getGameFile(id);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    // Снимаем Helmet-ограничения для игровых страниц:
    // iframe должен загружаться с любого нашего домена, CDN-скрипты должны работать
    res.removeHeader('X-Frame-Options');
    res.setHeader(
      'Content-Security-Policy',
      "default-src *; script-src * 'unsafe-inline' 'unsafe-eval'; style-src * 'unsafe-inline'; img-src * data:; connect-src *; font-src *;",
    );
    res.send(fileBuffer);
  }

  @Get(':id/download')
  async download(@Param('id') id: string, @Res() res: Response) {
    const fileBuffer = await this.gamesService.getGameFile(id);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="game-${id}.html"`);
    res.send(fileBuffer);
  }
}
