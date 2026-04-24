import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ClassesService } from './classes.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('classes')
@UseGuards(JwtAuthGuard)
export class ClassesController {
  constructor(private readonly classesService: ClassesService) {}

  @Post()
  create(@Request() req, @Body() body: { name: string; description?: string }) {
    return this.classesService.createClass(req.user.id, body);
  }

  @Get()
  findAll(@Request() req) {
    return this.classesService.getClasses(req.user.id);
  }

  @Get(':id')
  findOne(@Request() req, @Param('id') id: string) {
    return this.classesService.getClass(req.user.id, id);
  }

  @Get(':id/analytics')
  analytics(@Request() req, @Param('id') id: string) {
    return this.classesService.getClassAnalytics(req.user.id, id);
  }

  @Put(':id')
  update(
    @Request() req,
    @Param('id') id: string,
    @Body() body: { name?: string; description?: string },
  ) {
    return this.classesService.updateClass(req.user.id, id, body);
  }

  @Delete(':id')
  remove(@Request() req, @Param('id') id: string) {
    return this.classesService.deleteClass(req.user.id, id);
  }
}
