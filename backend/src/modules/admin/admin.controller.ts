import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from './guards/admin.guard';

/**
 * Админ-панель для управления данными БД
 * Требует авторизации и прав администратора
 */
@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ========== USERS ==========
  @Get('users')
  async getUsers(@Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.adminService.getUsers(
      limit ? parseInt(limit) : 50,
      offset ? parseInt(offset) : 0,
    );
  }

  @Get('users/:id')
  async getUser(@Param('id') id: string) {
    return this.adminService.getUser(id);
  }

  @Put('users/:id')
  async updateUser(@Param('id') id: string, @Body() body: any) {
    return this.adminService.updateUser(id, body);
  }

  @Delete('users/:id')
  async deleteUser(@Param('id') id: string) {
    return this.adminService.deleteUser(id);
  }

  // ========== GENERATIONS ==========
  @Get('generations')
  async getGenerations(@Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.adminService.getGenerations(
      limit ? parseInt(limit) : 50,
      offset ? parseInt(offset) : 0,
    );
  }

  @Get('generations/:id')
  async getGeneration(@Param('id') id: string) {
    return this.adminService.getGeneration(id);
  }

  @Put('generations/:id')
  async updateGeneration(@Param('id') id: string, @Body() body: any) {
    return this.adminService.updateGeneration(id, body);
  }

  @Delete('generations/:id')
  async deleteGeneration(@Param('id') id: string) {
    return this.adminService.deleteGeneration(id);
  }

  // ========== SUBSCRIPTIONS ==========
  @Get('subscriptions')
  async getSubscriptions(@Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.adminService.getSubscriptions(
      limit ? parseInt(limit) : 50,
      offset ? parseInt(offset) : 0,
    );
  }

  @Get('subscriptions/:id')
  async getSubscription(@Param('id') id: string) {
    return this.adminService.getSubscription(id);
  }

  @Put('subscriptions/:id')
  async updateSubscription(@Param('id') id: string, @Body() body: any) {
    return this.adminService.updateSubscription(id, body);
  }

  // ========== CREDIT TRANSACTIONS ==========
  @Get('transactions')
  async getTransactions(@Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.adminService.getTransactions(
      limit ? parseInt(limit) : 50,
      offset ? parseInt(offset) : 0,
    );
  }

  // ========== STATISTICS ==========
  @Get('stats')
  async getStats() {
    return this.adminService.getStats();
  }
}

