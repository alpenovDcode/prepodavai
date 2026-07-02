import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../../admin/guards/admin.guard';
import { ViolationsService } from './violations.service';
import { UpdateViolationDto } from './dto/update-violation.dto';

@Controller('admin/tutor-exchange/violations')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminViolationsController {
  constructor(private readonly violations: ViolationsService) {}

  @Get()
  list(@Query('status') status?: string) {
    return this.violations.listViolations({ status });
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateViolationDto) {
    return this.violations.updateViolation(id, body.status);
  }
}
