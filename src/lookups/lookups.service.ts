import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLookupOptionDto } from './dto/create-lookup-option.dto';
import { UpdateLookupOptionDto } from './dto/update-lookup-option.dto';
import { LOOKUP_GROUPS, LookupGroup } from './lookup-groups';

@Injectable()
export class LookupsService {
  constructor(private prisma: PrismaService) {}

  findAll(groupValue: string, active = true) {
    const group = this.parseGroup(groupValue);
    return this.prisma.lookupOption.findMany({
      where: { group: this.storageGroup(group), isActive: active },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
  }

  async create(groupValue: string, dto: CreateLookupOptionDto) {
    const group = this.parseGroup(groupValue);
    const storageGroup = this.storageGroup(group);
    if (group === 'activity-types' && (!/^[A-Z][A-Z0-9_]{0,99}$/.test(dto.code) || dto.code === 'STAGE_CHANGE')) throw new BadRequestException('کد نوع فعالیت باید انگلیسی بزرگ باشد؛ STAGE_CHANGE مختص سیستم است.');
    const existing = await this.prisma.lookupOption.findUnique({ where: { group_code: { group: storageGroup, code: dto.code } } });
    if (existing) throw new ConflictException('Lookup code already exists in this group');
    return this.prisma.lookupOption.create({ data: { group: storageGroup, ...dto } });
  }

  async update(groupValue: string, id: string, dto: UpdateLookupOptionDto) {
    const group = this.parseGroup(groupValue);
    const storageGroup = this.storageGroup(group);
    const current = await this.findOne(group, id);
    if (group === 'activity-types' && dto.code !== undefined && dto.code !== current.code) throw new BadRequestException('کد نوع فعالیت ثابت است؛ عنوان و وضعیت قابل ویرایش هستند.');
    if (dto.code) {
      const existing = await this.prisma.lookupOption.findFirst({ where: { group: storageGroup, code: dto.code, NOT: { id } } });
      if (existing) throw new ConflictException('Lookup code already exists in this group');
    }
    return this.prisma.lookupOption.update({ where: { id }, data: dto });
  }

  async remove(groupValue: string, id: string) {
    const group = this.parseGroup(groupValue);
    await this.findOne(group, id);
    return this.prisma.lookupOption.update({ where: { id }, data: { isActive: false } });
  }

  private async findOne(group: LookupGroup, id: string) {
    const item = await this.prisma.lookupOption.findFirst({ where: { id, group: this.storageGroup(group) } });
    if (!item) throw new NotFoundException('Lookup option not found in this group');
    return item;
  }

  private parseGroup(value: string): LookupGroup {
    const groupAliases: Record<string, LookupGroup> = {
      DEPARTMENTS: 'departments',
      JOB_TITLES: 'job-titles',
      POSITIONS: 'job-titles',
      SENIORITY_LEVELS: 'seniority-levels',
      PERSONA_ROLES: 'persona-roles',
      PERSONA_TAGS: 'persona-tags',
      OPPORTUNITY_SOURCES: 'opportunity-sources',
    };
    const normalized = groupAliases[value.trim().toUpperCase()] ?? value;

    if (!LOOKUP_GROUPS.includes(normalized as LookupGroup)) {
      throw new BadRequestException(`Invalid lookup group. Allowed groups: ${LOOKUP_GROUPS.join(', ')}`);
    }
    return normalized as LookupGroup;
  }

  private storageGroup(group: LookupGroup): string {
    return group === 'contact-types' ? 'contact_types' : group;
  }
}
