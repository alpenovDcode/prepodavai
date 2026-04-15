import { Body, Controller, Delete, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import { StudentInvitesService } from './student-invites.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('student-invites')
export class StudentInvitesController {
  constructor(private readonly invites: StudentInvitesService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Request() req: any, @Body() body: { classId?: string }) {
    return this.invites.createInvite(req.user.id, body?.classId);
  }

  @Get('mine')
  @UseGuards(JwtAuthGuard)
  mine(@Request() req: any) {
    return this.invites.listForTeacher(req.user.id);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  revoke(@Request() req: any, @Param('id') id: string) {
    return this.invites.revoke(req.user.id, id);
  }

  @Get(':token')
  preview(@Param('token') token: string) {
    return this.invites.getByToken(token);
  }

  @Post(':token/accept')
  accept(
    @Param('token') token: string,
    @Body() body: { name: string; email: string; password: string },
  ) {
    return this.invites.accept(token, body);
  }
}
