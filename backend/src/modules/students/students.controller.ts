import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { StudentsService } from './students.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('students')
@UseGuards(JwtAuthGuard)
export class StudentsController {
    constructor(private readonly studentsService: StudentsService) { }

    @Get('me')
    getMe(@Request() req) {
        return this.studentsService.getMe(req.user.id);
    }

    @Post()
    create(@Request() req, @Body() body: { classId: string; name: string; email?: string }) {
        return this.studentsService.createStudent(req.user.id, body);
    }

    @Get()
    findAll(@Request() req, @Query('classId') classId?: string) {
        return this.studentsService.getStudents(req.user.id, classId);
    }

    @Get(':id')
    findOne(@Request() req, @Param('id') id: string) {
        return this.studentsService.getStudent(req.user.id, id);
    }

    @Put(':id')
    update(@Request() req, @Param('id') id: string, @Body() body: { name?: string; email?: string; notes?: string }) {
        return this.studentsService.updateStudent(req.user.id, id, body);
    }

    @Delete(':id')
    remove(@Request() req, @Param('id') id: string) {
        return this.studentsService.deleteStudent(req.user.id, id);
    }
}
