import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { PersonaLibraryService } from './persona-library.service';
import { UpsertPersonaDto } from './dto/upsert-persona.dto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('persona-library')
export class PersonaLibraryController {
  constructor(private personaLibraryService: PersonaLibraryService) {}

  @Get()
  @Permissions('library:persona:view')
  findAll() {
    return this.personaLibraryService.findAll();
  }

  @Permissions('library:persona:manage')
  @Post()
  create(@Body() dto: UpsertPersonaDto) {
    return this.personaLibraryService.create(dto);
  }

  @Permissions('library:persona:manage')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpsertPersonaDto) {
    return this.personaLibraryService.update(id, dto);
  }

  @Permissions('library:persona:manage')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.personaLibraryService.remove(id);
  }
}
