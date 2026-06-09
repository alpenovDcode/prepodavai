import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Request,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PopupsService } from './popups.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../admin/guards/admin.guard';
import { CreatePopupDto, UpdatePopupDto } from './dto/popup.dto';

@SkipThrottle()
@Controller('admin/popups')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminPopupsController {
  constructor(private readonly popupsService: PopupsService) {}

  @Get()
  async list() {
    return this.popupsService.listAll();
  }

  @Post()
  async create(@Request() req: any, @Body() dto: CreatePopupDto) {
    return this.popupsService.create(req.user.id, dto);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdatePopupDto) {
    return this.popupsService.update(id, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.popupsService.remove(id);
  }
}
