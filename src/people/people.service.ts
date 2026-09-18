import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePersonDto } from './dto/create-person.dto';
import { UpdatePersonDto } from './dto/update-person.dto';
import { PaginationDto, PaginatedResponse } from '../common/dto/pagination.dto';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { Prisma } from '@prisma/client';
import { FindPeopleDirectoryDto } from './dto/find-people-directory.dto';
import { userTeamFilterWhere } from '../common/tenant/team-scope.util';
import { getCurrentOrganizationId } from '../common/tenant/tenant-scope.util';
import { CompanyAccessService } from '../companies/company-access.service';

@Injectable()
export class PeopleService {
  constructor(private prisma: PrismaService, private companyAccess: CompanyAccessService) {}

  async findDirectory(query: FindPeopleDirectoryDto, user: CurrentUserPayload): Promise<PaginatedResponse<any>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const and: Prisma.PersonWhereInput[] = [{
      company: {
        organizationId: getCurrentOrganizationId(user),
        archivedAt: null,
      },
    }];

    if (query.companyId) and.push({ companyId: query.companyId });
    if (query.ownerId) and.push({ company: { ownerId: query.ownerId } });
    if (query.team?.trim()) and.push({ company: { owner: userTeamFilterWhere([query.team]) } });
    if (query.department?.trim()) and.push({ department: query.department.trim() });
    if (query.jobTitle?.trim()) and.push({ title: query.jobTitle.trim() });
    if (query.seniorityLevel?.trim()) and.push({ seniorityLevel: query.seniorityLevel.trim() });
    const personaRoleFilter = query.personaRole?.trim() || query.personaTag?.trim();
    if (personaRoleFilter) and.push({ personaTag: personaRoleFilter });
    if (query.isPrimaryContact !== undefined) and.push({ isPrimaryContact: query.isPrimaryContact === 'true' });

    const emailAvailability: Prisma.PersonWhereInput = {
      OR: [
        { AND: [{ email: { not: null } }, { email: { not: '' } }] },
        { contacts: { some: { type: { contains: 'EMAIL', mode: 'insensitive' } } } },
      ],
    };
    const phoneTypes = ['MOBILE', 'WORK', 'HOME', 'INTERNAL', 'PHONE', 'WORK_PHONE'];
    const phoneAvailability: Prisma.PersonWhereInput = {
      OR: [
        { AND: [{ phone: { not: null } }, { phone: { not: '' } }] },
        { contacts: { some: { type: { in: phoneTypes } } } },
      ],
    };
    if (query.hasEmail !== undefined) and.push(query.hasEmail === 'true' ? emailAvailability : { NOT: emailAvailability });
    if (query.hasPhone !== undefined) and.push(query.hasPhone === 'true' ? phoneAvailability : { NOT: phoneAvailability });

    const search = query.search?.trim();
    if (search) {
      and.push({ OR: [
        { fullName: { contains: search, mode: 'insensitive' } },
        { title: { contains: search, mode: 'insensitive' } },
        { department: { contains: search, mode: 'insensitive' } },
        { personaTag: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { contacts: { some: { value: { contains: search, mode: 'insensitive' } } } },
        { company: { legalName: { contains: search, mode: 'insensitive' } } },
        { company: { brandName: { contains: search, mode: 'insensitive' } } },
      ] });
    }

    const where: Prisma.PersonWhereInput = { AND: and };
    const [people, total] = await Promise.all([
      this.prisma.person.findMany({
        where,
        select: {
          id: true, companyId: true, fullName: true, title: true, department: true, personaTag: true, seniorityLevel: true,
          email: true, phone: true, isPrimaryContact: true, createdAt: true, updatedAt: true,
          company: {
            select: {
              id: true,
              legalName: true,
              brandName: true,
              owner: {
                select: {
                  id: true,
                  fullName: true,
                  email: true,
                  team: true,
                  teamId: true,
                  teamRef: { select: { code: true, name: true } },
                },
              },
            },
          },
          contacts: {
            select: {
              id: true,
              type: true,
              typeOption: true,
              value: true,
              isPrimary: true,
            },
            orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
          },
          socials: {
            select: {
              id: true,
              platform: true,
              platformOption: true,
              handle: true,
            },
          },
        },
        orderBy: [{ fullName: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.person.count({ where }),
    ]);
    const emailContact = (contacts: Array<{ type: string; value: string }>) => contacts.find((item) => item.type.toUpperCase().includes('EMAIL'))?.value ?? null;
    const phoneContact = (contacts: Array<{ type: string; value: string }>) => contacts.find((item) => phoneTypes.includes(item.type.toUpperCase()))?.value ?? null;
    const data = people.map((person) => ({
      ...this.withDomainAliases(person),
      emailSummary: person.email || emailContact(person.contacts),
      phoneSummary: person.phone || phoneContact(person.contacts),
    }));
    const totalPages = Math.ceil(total / limit);
    return { data, meta: { total, page, limit, totalPages, hasNext: page < totalPages, hasPrevious: page > 1 } };
  }

  // ============================================================
  // ۱. دریافت مخاطبین یک شرکت (با صفحه‌بندی + محدودیت دسترسی)
  // ============================================================
  async findByCompany(
    companyId: string | undefined,  // ← تغییر نوع به string | undefined
    pagination: PaginationDto,
    user: CurrentUserPayload,
  ): Promise<PaginatedResponse<any>> {
    if (!companyId) {
      throw new BadRequestException('شناسه شرکت الزامی است');
    }

    await this.assertCompanyReadable(companyId, user);

    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.person.findMany({
        where: { companyId },
        orderBy: { createdAt: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.person.count({ where: { companyId } }),
    ]);

    const totalPages = Math.ceil(total / limit);
    return {
      data: data.map((person) => this.withDomainAliases(person)),
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasNext: page < totalPages,
        hasPrevious: page > 1,
      },
    };
  }

  // ============================================================
  // ۲. دریافت یک مخاطب (با بررسی دسترسی)
  // ============================================================
  async findOne(id: string, user: CurrentUserPayload) {
    const person = await this.prisma.person.findFirst({
      where: { id, company: { organizationId: getCurrentOrganizationId(user) } },
      include: {
      company: true,
      contacts: true,  // ← اضافه شد
      socials: true,   // ← اضافه شد
      employmentHistory: {
        include: {
          company: { select: { id: true, legalName: true, brandName: true } },
          positions: { orderBy: [{ isCurrent: 'desc' }, { startDate: 'desc' }] },
        },
        orderBy: { createdAt: 'desc' },
      },
      educationHistory: {
        include: { university: { select: { id: true, name: true } } },
        orderBy: [{ educationDate: 'desc' }, { createdAt: 'desc' }],
      },
      },
    });
    if (!person) throw new NotFoundException('مخاطب پیدا نشد');

    return this.withDomainAliases(person);
  }

  // ============================================================
  // ۳. ایجاد مخاطب جدید (با بررسی دسترسی)
  // ============================================================
  async create(dto: CreatePersonDto, user: CurrentUserPayload) {
    await this.validateCompanyAccess(dto.companyId, user);

    const { contacts, socials, jobTitle, personaRole, ...personData } = dto;

    const normalizedContacts = await Promise.all(
      (contacts ?? []).map(async (contact) => {
        const normalizedType = await this.resolveContactTypeReference(
          contact.typeOptionId,
        );

        const value = contact.value.trim();

        if (!value) {
          throw new BadRequestException('مقدار تماس الزامی است');
        }

        return {
          typeOptionId: normalizedType.typeOptionId,
          type: normalizedType.typeCode,
          value,
          isPrimary: contact.isPrimary ?? false,
          note: contact.note?.trim() || undefined,
        };
      }),
    );

    const normalizedSocials = await Promise.all(
      (socials ?? []).map(async (social) => {
        const normalizedPlatform = await this.resolveSocialPlatformReference(
          social.platformOptionId,
          social.platform,
          true,
        );

        const handle = social.handle.trim();

        if (!handle) {
          throw new BadRequestException('شناسه یا لینک شبکه اجتماعی الزامی است');
        }

        return {
          platformOptionId: normalizedPlatform.platformOptionId,
          platform: normalizedPlatform.platformCode,
          handle,
          isPrimary: social.isPrimary ?? false,
          note: social.note?.trim() || undefined,
        };
      }),
    );

    return this.prisma.person.create({
      data: {
        ...personData,
        title: jobTitle ?? personData.title,
        personaTag: personaRole ?? personData.personaTag,
        contacts: {
          create: normalizedContacts,
        },
        socials: {
          create: normalizedSocials,
        },
      },
      include: {
        contacts: {
          include: {
            typeOption: true,
          },
        },
        socials: {
          include: {
            platformOption: true,
          },
        },
      },
    }).then((person) => this.withDomainAliases(person));
  }

  // ============================================================
  // ۴. ویرایش مخاطب (با بررسی دسترسی)
  // ============================================================
  async update(id: string, dto: UpdatePersonDto, user: CurrentUserPayload) {
    const person = await this.prisma.person.findFirst({
      where: { id, company: { organizationId: getCurrentOrganizationId(user) } },
      include: { company: true },
    });
    if (!person) throw new NotFoundException('مخاطب پیدا نشد');

    await this.validateCompanyAccess(person.companyId, user);

    const { jobTitle, personaRole, ...personData } = dto;

    return this.prisma.person.update({
      where: { id },
      data: {
        ...personData,
        ...(jobTitle !== undefined && { title: jobTitle }),
        ...(personaRole !== undefined && { personaTag: personaRole }),
      },
    }).then((updated) => this.withDomainAliases(updated));
  }

  // ============================================================
  // ۵. حذف مخاطب (با بررسی دسترسی)
  // ============================================================
  async remove(id: string, user: CurrentUserPayload) {
    const person = await this.prisma.person.findFirst({
      where: { id, company: { organizationId: getCurrentOrganizationId(user) } },
      include: { company: true },
    });
    if (!person) throw new NotFoundException('مخاطب پیدا نشد');

    await this.validateCompanyAccess(person.companyId, user);

    const deleted = await this.prisma.person.deleteMany({
      where: { id, company: { organizationId: getCurrentOrganizationId(user) } },
    });
    if (!deleted.count) throw new NotFoundException('Person not found');
    return person;
  }

  private withDomainAliases<T extends { title?: string | null; personaTag?: string | null }>(
    person: T,
  ): T & { jobTitle: string | null; personaRole: string | null } {
    return {
      ...person,
      jobTitle: person.title ?? null,
      personaRole: person.personaTag ?? null,
    };
  }

  // ============================================================
  // متد کمکی: بررسی دسترسی به شرکت
  // ============================================================
  private async validateCompanyAccess(companyId: string, user: CurrentUserPayload) {
    await this.companyAccess.assertCompanyMutable(companyId, user);
  }

  private async assertCompanyReadable(
    companyId: string,
    user: CurrentUserPayload,
  ): Promise<void> {
    await this.companyAccess.assertCompanyReadable(companyId, user);
  }
private async resolveContactTypeReference(
  typeOptionId: string,
): Promise<{
  typeOptionId: string;
  typeCode: string;
}> {
  const option = await this.prisma.lookupOption.findUnique({
    where: { id: typeOptionId },
  });

  if (!option || option.group !== 'contact_types' || !option.isActive) {
    throw new BadRequestException('نوع تماس انتخاب‌شده معتبر یا فعال نیست');
  }

  return {
    typeOptionId: option.id,
    typeCode: option.code,
  };
}

private async resolveSocialPlatformReference(
  platformOptionId?: string,
  platform?: string,
  required = false,
): Promise<{
  platformOptionId: string | null;
  platformCode: string;
}> {
  if (platformOptionId) {
    const option = await this.prisma.lookupOption.findFirst({
      where: {
        id: platformOptionId,
        group: 'social_types',
        isActive: true,
      },
    });

    if (!option) {
      throw new BadRequestException('پلتفرم انتخاب‌شده معتبر یا فعال نیست');
    }

    return {
      platformOptionId: option.id,
      platformCode: option.code,
    };
  }

  const normalizedPlatform = platform?.trim();

  if (normalizedPlatform) {
    const option = await this.prisma.lookupOption.findFirst({
      where: {
        group: 'social_types',
        isActive: true,
        OR: [
          {
            code: {
              equals: normalizedPlatform,
              mode: 'insensitive',
            },
          },
          {
            label: {
              equals: normalizedPlatform,
              mode: 'insensitive',
            },
          },
        ],
      },
    });

    if (!option) {
      throw new BadRequestException(
        'پلتفرم باید از گزینه‌های پایه social_types انتخاب شود. مقدار متنی آزاد مجاز نیست',
      );
    }

    return {
      platformOptionId: option.id,
      platformCode: option.code,
    };
  }

  if (required) {
    throw new BadRequestException('platformOptionId یا platform الزامی است');
  }

  return {
    platformOptionId: null,
    platformCode: '',
  };
}

}
