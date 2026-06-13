import {
  Controller,
  Get,
  Post,
  Body,
  Request,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { SystemService } from './system.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../admin/guards/admin.guard';

class SetMaintenanceDto {
  @IsBoolean()
  enabled: boolean;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  message?: string;
}

/**
 * Публичный + админский эндпоинты для maintenance-режима.
 * GET /api/system/maintenance — публично, чтобы фронт мог показать заглушку
 *   даже неавторизованному пользователю.
 */
@Controller('system')
export class SystemController {
  constructor(private readonly systemService: SystemService) {}

  @Get('maintenance')
  async getMaintenance() {
    const status = await this.systemService.getMaintenanceStatus();
    return {
      enabled: status.enabled,
      message: status.message,
      updatedAt: status.updatedAt,
    };
  }
}

/**
 * Админская часть — отдельный контроллер с гвардом.
 */
@Controller('admin/maintenance')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminSystemController {
  constructor(private readonly systemService: SystemService) {}

  @Get()
  async get() {
    return this.systemService.getMaintenanceStatus(true);
  }

  @Post()
  @HttpCode(200)
  async set(@Request() req: any, @Body() body: SetMaintenanceDto) {
    return this.systemService.setMaintenance(body.enabled, body.message, req.user.id);
  }
}
