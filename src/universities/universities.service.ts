import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUniversityDto } from './dto/create-university.dto';
import { UpdateUniversityDto } from './dto/update-university.dto';

@Injectable()
export class UniversitiesService {
  constructor(private readonly prisma: PrismaService) {}
  findAll(includeInactive = false) { return this.prisma.university.findMany({ where: includeInactive ? {} : { isActive: true }, orderBy: { name: 'asc' } }); }
  async findOne(id: string) { const item = await this.prisma.university.findUnique({ where: { id } }); if (!item) throw new NotFoundException('University not found'); return item; }
  async create(dto: CreateUniversityDto) {
    const name = dto.name.trim(); const code = dto.code?.trim().toUpperCase() || null;
    if (!name) throw new ConflictException('University name is required');
    const duplicate = await this.prisma.university.findFirst({ where: { OR: [{ name: { equals: name, mode: 'insensitive' } }, ...(code ? [{ code }] : [])] } });
    if (duplicate) throw new ConflictException('University name or code already exists');
    return this.prisma.university.create({ data: { name, code, description: dto.description?.trim() || undefined, isActive: dto.isActive ?? true } });
  }
  async update(id: string, dto: UpdateUniversityDto) {
    await this.findOne(id); const name = dto.name?.trim(); const code = dto.code !== undefined ? dto.code.trim().toUpperCase() || null : undefined;
    if (name || code) { const duplicate = await this.prisma.university.findFirst({ where: { NOT: { id }, OR: [...(name ? [{ name: { equals: name, mode: 'insensitive' as const } }] : []), ...(code ? [{ code }] : [])] } }); if (duplicate) throw new ConflictException('University name or code already exists'); }
    return this.prisma.university.update({ where: { id }, data: { ...(name !== undefined && { name }), ...(code !== undefined && { code }), ...(dto.description !== undefined && { description: dto.description.trim() || null }), ...(dto.isActive !== undefined && { isActive: dto.isActive }) } });
  }
  async deactivate(id: string) { await this.findOne(id); return this.prisma.university.update({ where: { id }, data: { isActive: false } }); }
}
