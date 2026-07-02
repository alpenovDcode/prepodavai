import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ExchangeEnabledGuard } from '../guards/exchange-enabled.guard';
import { TutorsService } from './tutors.service';

@Controller('tutor-exchange/tutors')
@UseGuards(JwtAuthGuard, ExchangeEnabledGuard)
export class TutorsController {
  constructor(private readonly tutors: TutorsService) {}

  @Get(':id')
  getProfile(@Param('id') id: string) {
    return this.tutors.getPublicProfile(id);
  }
}
