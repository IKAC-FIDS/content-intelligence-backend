import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLeadSourceDto } from './dto/create-lead-source.dto';
import { UpdateLeadSourceDto } from './dto/update-lead-source.dto';

@Injectable()
export class LeadSourcesService {
  constructor(private prisma: PrismaService) {}

  findAll(active = true) {
    return this.prisma.leadSource.findMany({
      where: { isActive: active },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async create(dto: CreateLeadSourceDto) {
    const existing = await this.prisma.leadSource.findUnique({ where: { code: dto.code } });
    if (existing) throw new ConflictException('Lead source code already exists');
    return this.prisma.leadSource.create({ data: dto });
  }

  async update(id: string, dto: UpdateLeadSourceDto) {
    await this.findOne(id);
    if (dto.code) {
      const existing = await this.prisma.leadSource.findFirst({ where: { code: dto.code, NOT: { id } } });
      if (existing) throw new ConflictException('Lead source code already exists');
    }
    return this.prisma.leadSource.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.leadSource.update({ where: { id }, data: { isActive: false } });
  }

  private async findOne(id: string) {
    const item = await this.prisma.leadSource.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Lead source not found');
    return item;
  }
}
