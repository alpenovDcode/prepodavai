import { Controller, Post, Body, Get, Param, Res, UseGuards, Header, Req } from '@nestjs/common';
import { Response } from 'express';
import { GamesService } from './games.service';
import { CreateGameDto } from './dto/create-game.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('games')
export class GamesController {
    constructor(private readonly gamesService: GamesService) { }

    @Post('generate')
    @UseGuards(JwtAuthGuard)
    async generate(@Body() createGameDto: CreateGameDto, @Req() req) {
        return this.gamesService.generateGame(createGameDto, req.user.userId);
    }

    @Get(':id')
    async play(@Param('id') id: string, @Res() res: Response) {
        const fileBuffer = await this.gamesService.getGameFile(id);
        res.setHeader('Content-Type', 'text/html');
        res.send(fileBuffer);
    }

    @Get(':id/download')
    @Header('Content-Type', 'text/html')
    async download(@Param('id') id: string, @Res() res: Response) {
        const fileBuffer = await this.gamesService.getGameFile(id);
        res.setHeader('Content-Disposition', `attachment; filename="game-${id}.html"`);
        res.send(fileBuffer);
    }
}
