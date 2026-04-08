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
  async getUsers(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('search') search?: string,
    @Query('source') source?: string,
  ) {
    return this.adminService.getUsers(
      limit ? parseInt(limit) : 50,
      offset ? parseInt(offset) : 0,
      search,
      source,
    );
  }

  @Post('users')
  async createUser(@Body() body: any, @Request() req: any) {
    return this.adminService.createUser(body, req.user.id);
  }

  @Get('users/:id')
  async getUser(@Param('id') id: string) {
    return this.adminService.getUser(id);
  }

  @Put('users/:id')
  async updateUser(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.adminService.updateUser(id, body, req.user.id);
  }

  @Delete('users/:id')
  async deleteUser(@Param('id') id: string, @Request() req: any) {
    return this.adminService.deleteUser(id, req.user.id);
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
  async updateGeneration(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.adminService.updateGeneration(id, body, req.user.id);
  }

  @Delete('generations/:id')
  async deleteGeneration(@Param('id') id: string, @Request() req: any) {
    return this.adminService.deleteGeneration(id, req.user.id);
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
  async updateSubscription(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.adminService.updateSubscription(id, body, req.user.id);
  }

  // ========== CREDIT TRANSACTIONS ==========
  @Get('transactions')
  async getTransactions(@Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.adminService.getTransactions(
      limit ? parseInt(limit) : 50,
      offset ? parseInt(offset) : 0,
    );
  }

  // ========== FILES ==========
  @Get('files')
  async getFiles() {
    return this.adminService.getFiles();
  }

  @Delete('files/:hash')
  async deleteFile(@Param('hash') hash: string, @Request() req: any) {
    return this.adminService.deleteFile(hash, req.user.id);
  }

  // ========== SYSTEM LOGS ==========
  @Get('logs')
  async getSystemLogs(@Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.adminService.getSystemLogs(
      limit ? parseInt(limit) : 50,
      offset ? parseInt(offset) : 0,
    );
  }

  // ========== STATISTICS ==========
  @Get('stats')
  async getStats() {
    return this.adminService.getStats();
  }

  // ========== CREDIT COSTS ==========
  @Get('costs')
  async getCreditCosts() {
    return this.adminService.getCreditCosts();
  }

  @Put('costs/:operationType')
  async updateCreditCost(
    @Param('operationType') operationType: string,
    @Body() body: { creditCost?: number; isUnderMaintenance?: boolean },
    @Request() req: any,
  ) {
    return this.adminService.updateCreditCost(operationType, body, req.user.id);
  }

  // ========== USER DETAILED STATS ==========
  @Get('users/:id/stats')
  async getUserStats(@Param('id') id: string) {
    return this.adminService.getUserStats(id);
  }

  // ========== ANALYTICS ==========
  @Get('analytics')
  async getAnalytics(@Query('period') period?: 'week' | 'month' | 'quarter') {
    return this.adminService.getAnalytics(period || 'month');
  }

  // ========== CLASSES ==========
  @Get('classes')
  async getClasses(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('search') search?: string,
  ) {
    return this.adminService.getClasses(
      limit ? parseInt(limit) : 50,
      offset ? parseInt(offset) : 0,
      search,
    );
  }

  @Get('classes/:id/students')
  async getClassStudents(@Param('id') id: string) {
    return this.adminService.getClassStudents(id);
  }

  // ========== BULK CREDIT GRANT ==========
  @Post('credits/bulk-grant')
  async bulkGrantCredits(@Body() body: any, @Request() req: any) {
    return this.adminService.bulkGrantCredits(body, req.user.id);
  }

  // ========== BROADCAST ==========
  @Post('broadcast')
  async broadcast(@Body() body: any, @Request() req: any) {
    return this.adminService.broadcast(body, req.user.id);
  }

  // ========== REFERRALS OVERVIEW ==========
  @Get('referrals')
  async getReferrals(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.adminService.getReferrals(
      limit ? parseInt(limit) : 50,
      offset ? parseInt(offset) : 0,
    );
  }

  // ========== LOGS WITH FILTERS ==========
  @Get('logs/filtered')
  async getLogsFiltered(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('level') level?: string,
    @Query('category') category?: string,
    @Query('search') search?: string,
  ) {
    return this.adminService.getLogsFiltered(
      limit ? parseInt(limit) : 50,
      offset ? parseInt(offset) : 0,
      { level, category, search },
    );
  }

  // ========== CSV EXPORT ==========
  @Get('export/users')
  async exportUsers() {
    const csv = await this.adminService.exportUsersCsv();
    return { success: true, csv };
  }
}
