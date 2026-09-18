import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { PainPointsService } from './pain-points.service';
import { CreatePainPointDto } from './dto/create-pain-point.dto';
import { UpdatePainPointDto } from './dto/update-pain-point.dto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('pain-points')
export class PainPointsController {
  constructor(private painPointsService: PainPointsService) {}

  @Get()
  @Permissions('library:pain-point:view')
  findAll() {
    return this.painPointsService.findAll();
  }

  @Get(':id')
  @Permissions('library:pain-point:view')
  findOne(@Param('id') id: string) {
    return this.painPointsService.findOne(id);
  }

  @Permissions('library:pain-point:manage')
  @Post()
  create(@Body() dto: CreatePainPointDto) {
    return this.painPointsService.create(dto);
  }

  @Permissions('library:pain-point:manage')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePainPointDto) {
    return this.painPointsService.update(id, dto);
  }

  @Permissions('library:pain-point:manage')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.painPointsService.remove(id);
  }
}