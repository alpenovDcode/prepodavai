import { Controller, Post, Body, Get, Param, Res, UseGuards, Header } from '@nestjs/common';
import { Response } from 'express';
import { GamesService } from './games.service';
import { CreateGameDto } from './dto/create-game.dto';
// import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'; // Optional: protect generation

@Controller('games')
export class GamesController {
    constructor(private readonly gamesService: GamesService) { }

    @Post('generate')
    // @UseGuards(JwtAuthGuard) // Uncomment if auth is required
    async generate(@Body() createGameDto: CreateGameDto) {
        return this.gamesService.generateGame(createGameDto);
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
