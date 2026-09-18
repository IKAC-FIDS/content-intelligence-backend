import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Permissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { CreateUniversityDto } from './dto/create-university.dto';
import { UpdateUniversityDto } from './dto/update-university.dto';
import { UniversitiesService } from './universities.service';
@Controller('universities') @UseGuards(JwtAuthGuard, PermissionsGuard)
export class UniversitiesController {
  constructor(private readonly service: UniversitiesService) {}
  @Get() @Permissions('library:university:view') findAll(@Query('includeInactive') value?: string) { return this.service.findAll(value === 'true'); }
  @Get(':id') @Permissions('library:university:view') findOne(@Param('id') id: string) { return this.service.findOne(id); }
  @Post() @Permissions('library:university:manage') create(@Body() dto: CreateUniversityDto) { return this.service.create(dto); }
  @Patch(':id') @Permissions('library:university:manage') update(@Param('id') id: string, @Body() dto: UpdateUniversityDto) { return this.service.update(id, dto); }
  @Delete(':id') @Permissions('library:university:manage') remove(@Param('id') id: string) { return this.service.deactivate(id); }
}
