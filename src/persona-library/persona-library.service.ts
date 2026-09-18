import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertPersonaDto } from './dto/upsert-persona.dto';

@Injectable()
export class PersonaLibraryService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.personaLibrary.findMany({ orderBy: { titlePattern: 'asc' } });
  }

  create(dto: UpsertPersonaDto) {
    return this.prisma.personaLibrary.create({ data: dto });
  }

  async update(id: string, dto: UpsertPersonaDto) {
    const exists = await this.prisma.personaLibrary.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('Persona پیدا نشد');
    return this.prisma.personaLibrary.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    const exists = await this.prisma.personaLibrary.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('Persona پیدا نشد');
    return this.prisma.personaLibrary.delete({ where: { id } });
  }
}
