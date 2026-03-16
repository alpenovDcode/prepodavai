import { Controller, Get, Post, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { AssignmentsService } from './assignments.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('assignments')
@UseGuards(JwtAuthGuard)
export class AssignmentsController {
    constructor(private readonly assignmentsService: AssignmentsService) { }

    @Post()
    create(@Request() req, @Body() body: { lessonId: string; classId?: string; studentId?: string; dueDate?: string }) {
        return this.assignmentsService.createAssignment(req.user.id, {
            ...body,
            dueDate: body.dueDate ? new Date(body.dueDate) : undefined
        });
    }

    @Get()
    findAll(@Request() req, @Query() query: { classId?: string; studentId?: string; lessonId?: string }) {
        return this.assignmentsService.getAssignments(req.user.id, query);
    }

    @Get('my')
    findMy(@Request() req) {
        return this.assignmentsService.getMyAssignments(req.user.id);
    }

    @Get('class/:classId')
    findByClass(@Request() req, @Param('classId') classId: string) {
        return this.assignmentsService.getAssignmentsByClass(req.user.id, classId);
    }

    @Get(':id')
    findOne(@Request() req, @Param('id') id: string) {
        return this.assignmentsService.getAssignment(req.user.id, id);
    }
}
