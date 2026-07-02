import { Body, Controller, Param, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ExchangeEnabledGuard } from '../guards/exchange-enabled.guard';
import { RatingsService } from './ratings.service';
import { CreateRatingDto } from './dto/create-rating.dto';

@Controller('tutor-exchange/dialogs/:dialogId/ratings')
@UseGuards(JwtAuthGuard, ExchangeEnabledGuard)
export class RatingsController {
  constructor(private readonly ratings: RatingsService) {}

  @Post()
  create(
    @Request() req: any,
    @Param('dialogId') dialogId: string,
    @Body() body: CreateRatingDto,
  ) {
    return this.ratings.createRating(req.user.id, dialogId, body);
  }
}
