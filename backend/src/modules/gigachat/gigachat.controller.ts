import { Body, Controller, Get, Post, Query, Request, UseGuards } from '@nestjs/common';
import { GigachatGenerationsService } from './gigachat-generations.service';
import { GigachatGenerationDto } from './dto/gigachat-generation.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GigachatService } from './gigachat.service';

@Controller('gigachat')
@UseGuards(JwtAuthGuard)
export class GigachatController {
  constructor(
    private readonly gigachatGenerationsService: GigachatGenerationsService,
    private readonly gigachatService: GigachatService,
  ) {}

  @Post('generate')
  async generate(@Request() req, @Body() dto: GigachatGenerationDto) {
    return this.gigachatGenerationsService.generate(req.user.id, dto);
  }

  @Get('models')
  async listModels(@Query('capability') capability?: string) {
    return this.gigachatService.listModels(capability);
  }
}
