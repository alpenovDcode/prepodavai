import {
  Body,
  Controller,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ExchangeEnabledGuard } from '../guards/exchange-enabled.guard';
import { ViolationsService } from './violations.service';
import { CreateViolationDto } from './dto/create-violation.dto';

@Controller('tutor-exchange/dialogs/:dialogId/violations')
@UseGuards(JwtAuthGuard, ExchangeEnabledGuard)
export class ViolationsController {
  constructor(private readonly violations: ViolationsService) {}

  @Post()
  create(
    @Request() req: any,
    @Param('dialogId') dialogId: string,
    @Body() body: CreateViolationDto,
  ) {
    return this.violations.createViolation(req.user.id, dialogId, body);
  }
}
