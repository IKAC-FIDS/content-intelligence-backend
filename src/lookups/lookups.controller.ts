import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Permissions } from '../common/decorators/permissions.decorator';
import { ActiveFilterDto } from '../common/dto/active-filter.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { CreateLookupOptionDto } from './dto/create-lookup-option.dto';
import { UpdateLookupOptionDto } from './dto/update-lookup-option.dto';
import { LookupsService } from './lookups.service';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('lookups')
export class LookupsController {
  constructor(private service: LookupsService) {}

  @Get(':group')
  @Permissions('lookup:view')
  findAll(@Param('group') group: string, @Query() query: ActiveFilterDto) { return this.service.findAll(group, query.active ?? true); }

  @Post(':group')
  @Permissions('lookup:manage')
  create(@Param('group') group: string, @Body() dto: CreateLookupOptionDto) { return this.service.create(group, dto); }

  @Patch(':group/:id')
  @Permissions('lookup:manage')
  update(@Param('group') group: string, @Param('id') id: string, @Body() dto: UpdateLookupOptionDto) { return this.service.update(group, id, dto); }

  @Delete(':group/:id')
  @Permissions('lookup:manage')
  remove(@Param('group') group: string, @Param('id') id: string) { return this.service.remove(group, id); }
}
