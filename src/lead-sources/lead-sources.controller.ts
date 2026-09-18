import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Permissions } from '../common/decorators/permissions.decorator';
import { ActiveFilterDto } from '../common/dto/active-filter.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { CreateLeadSourceDto } from './dto/create-lead-source.dto';
import { UpdateLeadSourceDto } from './dto/update-lead-source.dto';
import { LeadSourcesService } from './lead-sources.service';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('lead-sources')
export class LeadSourcesController {
  constructor(private service: LeadSourcesService) {}

  @Get()
  @Permissions('library:lead-source:view')
  findAll(@Query() query: ActiveFilterDto) { return this.service.findAll(query.active ?? true); }

  @Post()
  @Permissions('library:lead-source:manage')
  create(@Body() dto: CreateLeadSourceDto) { return this.service.create(dto); }

  @Patch(':id')
  @Permissions('library:lead-source:manage')
  update(@Param('id') id: string, @Body() dto: UpdateLeadSourceDto) { return this.service.update(id, dto); }

  @Delete(':id')
  @Permissions('library:lead-source:manage')
  remove(@Param('id') id: string) { return this.service.remove(id); }
}
