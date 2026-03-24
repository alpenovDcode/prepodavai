import { Controller, Get, Post, Patch, Body, Param, UseGuards, Request } from '@nestjs/common';
import { SubmissionsService } from './submissions.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('submissions')
@UseGuards(JwtAuthGuard)
export class SubmissionsController {
  constructor(private readonly submissionsService: SubmissionsService) {}

  @Post()
  create(
    @Request() req,
    @Body() body: { assignmentId: string; content?: string; fileUrl?: string; attachments?: any[] },
  ) {
    return this.submissionsService.createSubmission(req.user.id, body);
  }

  @Patch(':id/grade')
  grade(
    @Request() req,
    @Param('id') id: string,
    @Body() body: { grade: number; feedback?: string },
  ) {
    return this.submissionsService.gradeSubmission(req.user.id, id, body);
  }

  @Get('my')
  findMy(@Request() req) {
    return this.submissionsService.getMySubmissions(req.user.id);
  }

  @Get('assignment/:id')
  findByAssignment(@Request() req, @Param('id') id: string) {
    return this.submissionsService.getSubmissionsForAssignment(req.user.id, id);
  }
}
