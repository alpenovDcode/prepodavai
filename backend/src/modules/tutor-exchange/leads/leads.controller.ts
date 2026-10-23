import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ExchangeEnabledGuard } from '../guards/exchange-enabled.guard';
import { LeadsService } from './leads.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { ListLeadsQueryDto } from './dto/list-leads.query.dto';

@Controller('tutor-exchange/leads')
@UseGuards(JwtAuthGuard, ExchangeEnabledGuard)
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Get()
  list(@Request() req: any, @Query() query: ListLeadsQueryDto) {
    return this.leadsService.listLeads(req.user.id, query);
  }

  @Get('mine')
  mine(@Request() req: any) {
    return this.leadsService.listMyLeads(req.user.id);
  }

  @Get(':id')
  getOne(@Request() req: any, @Param('id') id: string) {
    return this.leadsService.getLead(req.user.id, id);
  }

  @Post()
  create(@Request() req: any, @Body() body: CreateLeadDto) {
    return this.leadsService.createLead(req.user.id, body);
  }

  @Patch(':id')
  update(@Request() req: any, @Param('id') id: string, @Body() body: UpdateLeadDto) {
    return this.leadsService.updateLead(req.user.id, id, body as any);
  }

  @Delete(':id')
  remove(@Request() req: any, @Param('id') id: string) {
    return this.leadsService.deleteLead(req.user.id, id);
  }
}
