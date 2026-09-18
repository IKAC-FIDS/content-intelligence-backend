import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  LegacyPipelineStage,
  Priority,
  Prisma,
  QuotaMetric,
  UserRole,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AuditLogService } from '../audit-log/audit-log.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { PaginatedResponse, PaginationDto } from '../common/dto/pagination.dto';
import { OwnershipScope } from '../common/dto/ownership-scope.dto';
import {
  getCurrentOrganizationId,
  tenantScope,
} from '../common/tenant/tenant-scope.util';
import { parseApiDate } from '../common/dates/api-date.util';
import {
  userMatchesTeam,
  userTeamScopeWhere,
} from '../common/tenant/team-scope.util';
import { PrismaService } from '../prisma/prisma.service';
import { ArchiveCompanyDto } from './dto/archive-company.dto';
import { ChangeOwnerDto, BulkChangeOwnerDto } from './dto/change-owner.dto';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { CompanyAccessService } from './company-access.service';
import { QuotaService } from '../quota/quota.service';
import { FindCompanyOptionsDto } from './dto/find-company-options.dto';
import { isPhoneLikeSearch, normalizeCompanyPhone } from './company-phone.util';
import { ProfileMediaService } from '../profile-media/profile-media.service';

const companyOptionSelect = {
  id: true,
  legalName: true,
  brandName: true,
  nationalId: true,
  registrationNumber: true,
  economicCode: true,
  parentCompanyId: true,
} satisfies Prisma.CompanySelect;

@Injectable()
export class CompaniesService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditLogService,
    private companyAccess: CompanyAccessService,
    private quota: QuotaService,
    private readonly profileMedia: ProfileMediaService,
  ) {}

  async getLogo(id: string, user: CurrentUserPayload) {
    const company = await this.prisma.company.findFirst({
      where: { id, organizationId: getCurrentOrganizationId(user) },
      select: { logoObjectKey: true, logoStoragePath: true, logoBucket: true, logoMimeType: true },
    });
    if (!company) throw new NotFoundException('Company not found');
    if (!company.logoObjectKey || !company.logoMimeType) throw new NotFoundException('Company logo not found');
    return {
      mimeType: company.logoMimeType,
      stream: await this.profileMedia.getStream({
        objectKey: company.logoObjectKey,
        storagePath: company.logoStoragePath,
        bucket: company.logoBucket,
      }),
    };
  }

  async updateLogo(id: string, file: Express.Multer.File | undefined, user: CurrentUserPayload) {
    const organizationId = getCurrentOrganizationId(user);
    const company = await this.prisma.company.findFirst({ where: { id, organizationId } });
    if (!company) throw new NotFoundException('Company not found');
    const saved = await this.profileMedia.save('companies', id, file);
    const updated = await this.prisma.company.update({
        where: { id },
        data: {
          logoStorageProvider: saved.storageProvider,
          logoBucket: saved.bucket,
          logoObjectKey: saved.objectKey,
          logoStoragePath: saved.storagePath,
          logoMimeType: saved.mimeType,
          logoOriginalName: saved.originalName,
        },
      }).catch(async (error) => {
      await this.profileMedia.delete(saved);
      throw error;
    });
    await this.profileMedia.delete({ objectKey: company.logoObjectKey, storagePath: company.logoStoragePath, bucket: company.logoBucket }).catch(() => undefined);
    await this.audit.record({ actorId: user.userId, organizationId, entityType: 'company', entityId: id, action: 'company.logo_updated' });
    return updated;
  }

  async removeLogo(id: string, user: CurrentUserPayload) {
    const organizationId = getCurrentOrganizationId(user);
    const company = await this.prisma.company.findFirst({ where: { id, organizationId } });
    if (!company) throw new NotFoundException('Company not found');
    const updated = await this.prisma.company.update({
      where: { id },
      data: { logoStorageProvider: null, logoBucket: null, logoObjectKey: null, logoStoragePath: null, logoMimeType: null, logoOriginalName: null },
    });
    await this.profileMedia.delete({ objectKey: company.logoObjectKey, storagePath: company.logoStoragePath, bucket: company.logoBucket }).catch(() => undefined);
    await this.audit.record({ actorId: user.userId, organizationId, entityType: 'company', entityId: id, action: 'company.logo_removed' });
    return updated;
  }

  async findOptions(
    user: CurrentUserPayload,
    query: FindCompanyOptionsDto,
  ): Promise<
    PaginatedResponse<
      Prisma.CompanyGetPayload<{ select: typeof companyOptionSelect }>
    >
  > {
    const page = query.page ?? 1;
    const limit = query.limit ?? 25;
    const search = query.search?.trim();
    const where: Prisma.CompanyWhereInput = {
      organizationId: getCurrentOrganizationId(user),
      ...(!query.includeArchived && { archivedAt: null }),
      ...(query.excludeId && { id: { not: query.excludeId } }),
    };

    if (query.selectedId) {
      where.id = query.excludeId
        ? { equals: query.selectedId, not: query.excludeId }
        : query.selectedId;
    } else if (search) {
      where.OR = [
        { legalName: { contains: search, mode: 'insensitive' } },
        { brandName: { contains: search, mode: 'insensitive' } },
        { nationalId: { contains: search, mode: 'insensitive' } },
        { registrationNumber: { contains: search, mode: 'insensitive' } },
        { economicCode: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.company.findMany({
        where,
        select: companyOptionSelect,
        orderBy: [
          { brandName: 'asc' },
          { legalName: 'asc' },
          { createdAt: 'desc' },
          { id: 'asc' },
        ],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.company.count({ where }),
    ]);
    const totalPages = Math.ceil(total / limit);

    return {
      data,
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

  async findOption(id: string, user: CurrentUserPayload) {
    const company = await this.prisma.company.findFirst({
      where: {
        id,
        organizationId: getCurrentOrganizationId(user),
      },
      select: companyOptionSelect,
    });

    if (!company) throw new NotFoundException('Company not found');
    return company;
  }

  async findAll(
    user: CurrentUserPayload,
    pagination: PaginationDto,
    filters?: {
      stage?: LegacyPipelineStage;
      priority?: Priority;
      industryId?: string;
      industry?: string;
      sourceId?: string;
      source?: string;
      withoutOwner?: boolean;
      search?: string;
      ownerId?: string;
      ownershipScope?: OwnershipScope;
      includeArchived?: boolean;
      archivedOnly?: boolean;
    },
  ): Promise<PaginatedResponse<any>> {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.CompanyWhereInput = {
      organizationId: getCurrentOrganizationId(user),
    };

    const ownershipScope = filters?.ownershipScope ?? OwnershipScope.ALL;
    if (ownershipScope === OwnershipScope.MINE) {
      where.ownerId = user.userId;
    } else if (ownershipScope === OwnershipScope.TEAM) {
      where.owner = userTeamScopeWhere(user);
    } else if (ownershipScope === OwnershipScope.UNASSIGNED) {
      where.ownerId = null;
    }

    if (filters?.withoutOwner) {
      where.ownerId = null;
    }

    if (filters?.stage) {
      where.stage = filters.stage;
    }

    if (filters?.priority) {
      where.priority = filters.priority;
    }

    if (filters?.industryId) {
      where.industryId = filters.industryId;
    } else if (filters?.industry?.trim()) {
      where.industry = {
        equals: filters.industry.trim(),
        mode: 'insensitive',
      };
    }

    if (filters?.sourceId) {
      where.sourceId = filters.sourceId;
    } else if (filters?.source?.trim()) {
      where.source = {
        equals: filters.source.trim(),
        mode: 'insensitive',
      };
    }

    if (filters?.ownerId) {
      where.ownerId = filters.ownerId;
    }

    if (filters?.search?.trim()) {
      const search = filters.search.trim();
      const normalizedPhoneSearch = normalizeCompanyPhone(search);

      where.OR = [
        { legalName: { contains: search, mode: 'insensitive' } },
        { brandName: { contains: search, mode: 'insensitive' } },
        { industry: { contains: search, mode: 'insensitive' } },
        { headOfficeCity: { contains: search, mode: 'insensitive' } },
        { industryRef: { name: { contains: search, mode: 'insensitive' } } },
        { sourceRef: { name: { contains: search, mode: 'insensitive' } } },
        { sourceRef: { code: { contains: search, mode: 'insensitive' } } },
      ];

      if (isPhoneLikeSearch(normalizedPhoneSearch)) {
        where.OR.push({
          centralPhone: { contains: normalizedPhoneSearch },
        });
      }
    }

    if (filters?.archivedOnly) {
      where.archivedAt = { not: null };
    } else if (!filters?.includeArchived) {
      where.archivedAt = null;
    }

    const [data, total] = await Promise.all([
      this.prisma.company.findMany({
        where,
        include: {
          owner: {
            select: {
              id: true,
              fullName: true,
              team: true,
              avatarObjectKey: true,
            },
          },
          industryRef: {
            select: {
              id: true,
              name: true,
              description: true,
            },
          },
          sourceRef: {
            select: {
              id: true,
              code: true,
              name: true,
              description: true,
              isActive: true,
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.company.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data,
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

  async findOne(id: string, user: CurrentUserPayload) {
    const company = await this.prisma.company.findFirst({
      where: { id, organizationId: getCurrentOrganizationId(user) },
      include: {
        owner: { select: { id: true, fullName: true, team: true, avatarObjectKey: true } },
        industryRef: true,
        sourceRef: true,
        people: true,
        branches: true,
        socialChannels: true,
        callCard: true,
        activities: { orderBy: { occurredAt: 'desc' }, take: 20 },
        stageHistory: { orderBy: { changedAt: 'desc' } },
        opportunities: {
          include: {
            stage: true,
            owner: {
              select: { id: true, fullName: true, email: true, team: true },
            },
          },
          orderBy: { updatedAt: 'desc' },
        },
        parentRelations: { include: { parentCompany: true } },
        subsidiaryRelations: { include: { subsidiaryCompany: true } },
        legalDocuments: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!company) throw new NotFoundException('شرکت پیدا نشد');

    return this.withHierarchy(company);
  }

  async create(dto: CreateCompanyDto, user: CurrentUserPayload) {
    if (user.role === UserRole.BOARDS) {
      throw new ForbiddenException('شما اجازه ایجاد شرکت را ندارید');
    }

    const {
      industryId,
      industry,
      sourceId,
      source,
      parentCompanyIds,
      subsidiaryCompanyIds,
      establishmentDate,
      registeredCapital,
      centralPhone,
      ...companyData
    } = dto;

    const normalizedRefs = await this.resolveCompanyReferences({
      industryId,
      industry,
      sourceId,
      source,
      applyDefaultSource: true,
    });

    if (dto.ownerId) {
      await this.assertOwnerInOrganization(dto.ownerId, user);
    }

    const organizationId = getCurrentOrganizationId(user);
    await this.validateRelatedCompanies(
      [
        ...new Set([
          ...(parentCompanyIds ?? []),
          ...(subsidiaryCompanyIds ?? []),
        ]),
      ],
      organizationId,
    );
    const reservation = await this.quota.reserve(
      organizationId,
      QuotaMetric.COMPANIES,
      1n,
      `company:create:${randomUUID()}`,
      new Date(),
      user.userId,
      user.tenantContext?.requestId,
    );
    let company;
    try {
      company = await this.prisma.$transaction(async (tx) => {
        const created = await tx.company.create({
          data: {
            ...companyData,
            centralPhone: normalizeCompanyPhone(centralPhone),
            establishmentDate: establishmentDate
              ? parseApiDate(establishmentDate, 'establishmentDate')
              : undefined,
            registeredCapital:
              registeredCapital !== undefined
                ? new Prisma.Decimal(registeredCapital)
                : undefined,
            industryId: normalizedRefs.industryId,
            industry: normalizedRefs.industryName,
            sourceId: normalizedRefs.sourceId,
            source: normalizedRefs.sourceCode,
            ownerId: dto.ownerId ?? null,
            organizationId,
          },
        });
        await this.replaceHierarchy(
          tx,
          created.id,
          parentCompanyIds ?? [],
          subsidiaryCompanyIds ?? [],
        );
        return tx.company.findUniqueOrThrow({
          where: { id: created.id },
          include: this.companySummaryInclude(),
        });
      });
    } catch (error) {
      await this.quota.releaseReservation(reservation.reservationId);
      throw error;
    }
    await this.quota.commitReservation(reservation.reservationId);

    await this.audit.record({
      actorId: user.userId,
      organizationId: getCurrentOrganizationId(user),
      entityType: 'company',
      entityId: company.id,
      action: 'company.created',
      after: company,
    });

    return this.withHierarchy(company);
  }

  async update(id: string, dto: UpdateCompanyDto, user: CurrentUserPayload) {
    if (user.role === UserRole.BOARDS) {
      throw new ForbiddenException('شما اجازه ویرایش شرکت را ندارید');
    }

    const company = await this.prisma.company.findFirst({
      where: { id, organizationId: getCurrentOrganizationId(user) },
    });

    if (!company) throw new NotFoundException('شرکت پیدا نشد');

    await this.companyAccess.assertCompanyMutable(id, user);

    const {
      industryId,
      industry,
      sourceId,
      source,
      parentCompanyIds,
      subsidiaryCompanyIds,
      establishmentDate,
      registeredCapital,
      centralPhone,
      ...companyData
    } = dto;

    const updateData: Prisma.CompanyUncheckedUpdateInput = {
      ...companyData,
    };
    if (establishmentDate !== undefined)
      updateData.establishmentDate = establishmentDate
        ? parseApiDate(establishmentDate, 'establishmentDate')
        : null;
    if (registeredCapital !== undefined)
      updateData.registeredCapital = new Prisma.Decimal(registeredCapital);
    if (centralPhone !== undefined) {
      updateData.centralPhone = normalizeCompanyPhone(centralPhone);
    }

    if (industryId !== undefined || industry !== undefined) {
      const normalizedIndustry = await this.resolveIndustryReference(
        industryId,
        industry,
      );

      updateData.industryId = normalizedIndustry.industryId;
      updateData.industry = normalizedIndustry.industryName;
    }

    if (sourceId !== undefined || source !== undefined) {
      const normalizedSource = await this.resolveSourceReference(
        sourceId,
        source,
        false,
      );

      updateData.sourceId = normalizedSource.sourceId;
      updateData.source = normalizedSource.sourceCode;
    }

    const organizationId = getCurrentOrganizationId(user);
    const relationIds = [
      ...new Set([
        ...(parentCompanyIds ?? []),
        ...(subsidiaryCompanyIds ?? []),
      ]),
    ];
    if (relationIds.includes(id))
      throw new BadRequestException('A company cannot be related to itself');
    await this.validateRelatedCompanies(relationIds, organizationId);
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.company.update({ where: { id }, data: updateData });
      if (
        parentCompanyIds !== undefined ||
        subsidiaryCompanyIds !== undefined
      ) {
        const currentParents =
          parentCompanyIds ??
          (
            await tx.companyHierarchyRelation.findMany({
              where: { subsidiaryCompanyId: id },
              select: { parentCompanyId: true },
            })
          ).map((item) => item.parentCompanyId);
        const currentSubsidiaries =
          subsidiaryCompanyIds ??
          (
            await tx.companyHierarchyRelation.findMany({
              where: { parentCompanyId: id },
              select: { subsidiaryCompanyId: true },
            })
          ).map((item) => item.subsidiaryCompanyId);
        await this.replaceHierarchy(
          tx,
          id,
          currentParents,
          currentSubsidiaries,
        );
      }
      return tx.company.findUniqueOrThrow({
        where: { id },
        include: this.companySummaryInclude(),
      });
    });

    await this.audit.record({
      actorId: user.userId,
      organizationId: getCurrentOrganizationId(user),
      entityType: 'company',
      entityId: id,
      action: 'company.updated',
      before: company,
      after: updated,
    });

    return this.withHierarchy(updated);
  }

  async changeOwner(id: string, dto: ChangeOwnerDto, user: CurrentUserPayload) {
    if (user.role === UserRole.BOARDS) {
      throw new ForbiddenException('شما اجازه تغییر مالکیت شرکت را ندارید');
    }

    const company = await this.prisma.company.findFirst({
      where: { id, organizationId: getCurrentOrganizationId(user) },
      include: { owner: true },
    });

    if (!company) throw new NotFoundException('شرکت پیدا نشد');

    await this.companyAccess.assertCompanyMutable(id, user);

    const newOwner = await this.prisma.user.findFirst({
      where: { id: dto.newOwnerId, ...tenantScope.activeMembership(user) },
    });

    if (!newOwner) throw new NotFoundException('کاربر جدید پیدا نشد');

    if (newOwner.role !== UserRole.REP && newOwner.role !== UserRole.MANAGER) {
      throw new BadRequestException(
        'کاربر جدید باید نقش REP یا MANAGER داشته باشد',
      );
    }

    if (newOwner.role === UserRole.MANAGER) {
      if (
        company.owner &&
        !userMatchesTeam(newOwner, {
          ...user,
          teamId: company.owner.teamId,
          team: company.owner.team,
        })
      ) {
        throw new BadRequestException('مدیر فروش باید در همان تیم شرکت باشد');
      }
    }

    const updated = await this.prisma.company.update({
      where: { id },
      data: { ownerId: dto.newOwnerId },
    });

    await this.audit.record({
      actorId: user.userId,
      organizationId: getCurrentOrganizationId(user),
      entityType: 'company',
      entityId: id,
      action: 'company.owner_changed',
      before: { ownerId: company.ownerId },
      after: { ownerId: updated.ownerId },
    });

    return updated;
  }

  async archive(id: string, dto: ArchiveCompanyDto, user: CurrentUserPayload) {
    const company = await this.prisma.company.findFirst({
      where: { id, organizationId: getCurrentOrganizationId(user) },
      include: { owner: { select: { team: true, teamId: true } } },
    });

    if (!company) throw new NotFoundException('شرکت پیدا نشد');

    await this.companyAccess.assertCompanyMutable(id, user);

    if (company.archivedAt) {
      throw new BadRequestException('شرکت قبلاً بایگانی شده است');
    }

    const archived = await this.prisma.company.update({
      where: { id },
      data: {
        archivedAt: new Date(),
        archivedById: user.userId,
        archiveReason: dto.reason,
      },
    });
    await Promise.all([
      this.quota.synchronizeInventory(
        getCurrentOrganizationId(user),
        QuotaMetric.COMPANIES,
      ),
      this.quota.synchronizeInventory(
        getCurrentOrganizationId(user),
        QuotaMetric.OPPORTUNITIES,
      ),
    ]);

    await this.audit.record({
      actorId: user.userId,
      organizationId: getCurrentOrganizationId(user),
      entityType: 'company',
      entityId: id,
      action: 'company.archived',
      before: company,
      after: archived,
    });

    return archived;
  }

  async restore(id: string, user: CurrentUserPayload) {
    const company = await this.prisma.company.findFirst({
      where: { id, organizationId: getCurrentOrganizationId(user) },
      include: { owner: { select: { team: true, teamId: true } } },
    });

    if (!company) throw new NotFoundException('شرکت پیدا نشد');

    await this.companyAccess.assertCompanyMutable(id, user, {
      allowArchived: true,
    });

    if (!company.archivedAt) {
      throw new BadRequestException('شرکت بایگانی نشده است');
    }

    const reservation = await this.quota.reserve(
      getCurrentOrganizationId(user),
      QuotaMetric.COMPANIES,
      1n,
      `company:restore:${id}`,
      new Date(),
      user.userId,
      user.tenantContext?.requestId,
    );
    const opportunityCount = BigInt(
      await this.prisma.opportunity.count({
        where: {
          organizationId: getCurrentOrganizationId(user),
          companyId: id,
          archivedAt: null,
        },
      }),
    );
    let opportunityReservation: Awaited<
      ReturnType<QuotaService['reserve']>
    > | null = null;
    try {
      if (opportunityCount > 0n)
        opportunityReservation = await this.quota.reserve(
          getCurrentOrganizationId(user),
          QuotaMetric.OPPORTUNITIES,
          opportunityCount,
          `company:restore:opportunities:${id}`,
          new Date(),
          user.userId,
          user.tenantContext?.requestId,
        );
    } catch (error) {
      await this.quota.releaseReservation(reservation.reservationId);
      throw error;
    }
    let restored;
    try {
      restored = await this.prisma.company.update({
        where: { id },
        data: {
          archivedAt: null,
          archivedById: null,
          archiveReason: null,
        },
      });
    } catch (error) {
      await Promise.all([
        this.quota.releaseReservation(reservation.reservationId),
        this.quota.releaseReservation(
          opportunityReservation?.reservationId ?? null,
        ),
      ]);
      throw error;
    }
    await this.quota.commitReservations([
      reservation.reservationId,
      opportunityReservation?.reservationId ?? null,
    ]);

    await this.audit.record({
      actorId: user.userId,
      organizationId: getCurrentOrganizationId(user),
      entityType: 'company',
      entityId: id,
      action: 'company.restored',
      before: company,
      after: restored,
    });

    return restored;
  }

  async bulkChangeOwner(dto: BulkChangeOwnerDto, user: CurrentUserPayload) {
    if (user.role === UserRole.BOARDS) {
      throw new ForbiddenException(
        'شما اجازه تغییر مالکیت گروهی شرکت‌ها را ندارید',
      );
    }

    const newOwner = await this.prisma.user.findFirst({
      where: { id: dto.newOwnerId, ...tenantScope.activeMembership(user) },
    });

    if (!newOwner) throw new NotFoundException('کاربر جدید پیدا نشد');

    if (newOwner.role !== UserRole.REP && newOwner.role !== UserRole.MANAGER) {
      throw new BadRequestException(
        'کاربر جدید باید نقش REP یا MANAGER داشته باشد',
      );
    }

    const companies = await this.prisma.company.findMany({
      where: {
        id: { in: dto.companyIds },
        organizationId: getCurrentOrganizationId(user),
      },
      include: { owner: true },
    });

    if (companies.length === 0) {
      throw new BadRequestException('هیچ شرکتی با این شناسه‌ها پیدا نشد');
    }

    for (const company of companies) {
      await this.companyAccess.assertCompanyMutable(company.id, user);
    }

    if (newOwner.role === UserRole.MANAGER) {
      for (const company of companies) {
        if (
          company.owner &&
          !userMatchesTeam(newOwner, {
            ...user,
            teamId: company.owner.teamId,
            team: company.owner.team,
          })
        ) {
          throw new BadRequestException(
            `شرکت ${company.legalName} در تیم دیگری است و مدیر جدید عضو همان تیم نیست`,
          );
        }
      }
    }

    const result = await this.prisma.company.updateMany({
      where: {
        id: { in: dto.companyIds },
        organizationId: getCurrentOrganizationId(user),
      },
      data: { ownerId: dto.newOwnerId },
    });

    await Promise.all(
      companies.map((company) =>
        this.audit.record({
          actorId: user.userId,
          organizationId: getCurrentOrganizationId(user),
          entityType: 'company',
          entityId: company.id,
          action: 'company.owner_changed',
          before: { ownerId: company.ownerId },
          after: { ownerId: dto.newOwnerId },
          metadata: { bulk: true },
        }),
      ),
    );

    return {
      message: `${result.count} شرکت با موفقیت به کاربر ${newOwner.fullName} اختصاص یافت`,
      updatedCount: result.count,
    };
  }

  private async assertOwnerInOrganization(
    ownerId: string,
    user: CurrentUserPayload,
  ) {
    const owner = await this.prisma.user.findFirst({
      where: {
        id: ownerId,
        ...tenantScope.activeMembership(user),
        isActive: true,
      },
    });

    if (!owner) {
      throw new BadRequestException(
        'Owner must belong to the current organization',
      );
    }
  }

  private async resolveCompanyReferences(input: {
    industryId?: string;
    industry?: string;
    sourceId?: string;
    source?: string;
    applyDefaultSource: boolean;
  }) {
    const normalizedIndustry = await this.resolveIndustryReference(
      input.industryId,
      input.industry,
    );

    const normalizedSource = await this.resolveSourceReference(
      input.sourceId,
      input.source,
      input.applyDefaultSource,
    );

    return {
      ...normalizedIndustry,
      ...normalizedSource,
    };
  }

  private async resolveIndustryReference(
    industryId?: string,
    industryName?: string,
  ): Promise<{
    industryId: string | null;
    industryName: string | null;
  }> {
    if (industryId) {
      const industry = await this.prisma.industry.findUnique({
        where: { id: industryId },
      });

      if (!industry) {
        throw new BadRequestException('صنعت انتخاب‌شده معتبر نیست');
      }

      return {
        industryId: industry.id,
        industryName: industry.name,
      };
    }

    const normalizedName = industryName?.trim();

    if (!normalizedName) {
      return {
        industryId: null,
        industryName: null,
      };
    }

    const industry = await this.prisma.industry.findFirst({
      where: {
        name: {
          equals: normalizedName,
          mode: 'insensitive',
        },
      },
    });

    if (!industry) {
      throw new BadRequestException(
        'صنعت باید از کتابخانه صنایع انتخاب شود. مقدار متنی آزاد مجاز نیست',
      );
    }

    return {
      industryId: industry.id,
      industryName: industry.name,
    };
  }

  private async resolveSourceReference(
    sourceId?: string,
    source?: string,
    applyDefaultSource = false,
  ): Promise<{
    sourceId: string | null;
    sourceCode: string | null;
  }> {
    if (sourceId) {
      const leadSource = await this.prisma.leadSource.findUnique({
        where: { id: sourceId },
      });

      if (!leadSource || !leadSource.isActive) {
        throw new BadRequestException('منبع جذب انتخاب‌شده معتبر یا فعال نیست');
      }

      return {
        sourceId: leadSource.id,
        sourceCode: leadSource.code,
      };
    }

    const normalizedSource = source?.trim();

    if (normalizedSource) {
      const leadSource = await this.prisma.leadSource.findFirst({
        where: {
          isActive: true,
          OR: [
            {
              code: {
                equals: normalizedSource,
                mode: 'insensitive',
              },
            },
            {
              name: {
                equals: normalizedSource,
                mode: 'insensitive',
              },
            },
          ],
        },
      });

      if (!leadSource) {
        throw new BadRequestException(
          'منبع جذب باید از کتابخانه Lead Sources انتخاب شود. مقدار متنی آزاد مجاز نیست',
        );
      }

      return {
        sourceId: leadSource.id,
        sourceCode: leadSource.code,
      };
    }

    if (applyDefaultSource) {
      const defaultLeadSource = await this.prisma.leadSource.findUnique({
        where: { code: 'SAM_LIST' },
      });

      if (defaultLeadSource?.isActive) {
        return {
          sourceId: defaultLeadSource.id,
          sourceCode: defaultLeadSource.code,
        };
      }
    }

    return {
      sourceId: null,
      sourceCode: null,
    };
  }

  private companySummaryInclude() {
    return {
      owner: { select: { id: true, fullName: true, team: true } },
      industryRef: true,
      sourceRef: true,
      parentRelations: { include: { parentCompany: true } },
      subsidiaryRelations: { include: { subsidiaryCompany: true } },
    } as const;
  }

  private withHierarchy<
    T extends {
      parentRelations?: Array<{ parentCompany: unknown }>;
      subsidiaryRelations?: Array<{ subsidiaryCompany: unknown }>;
    },
  >(company: T) {
    return {
      ...company,
      parentCompanies:
        company.parentRelations?.map((item) => item.parentCompany) ?? [],
      subsidiaryCompanies:
        company.subsidiaryRelations?.map((item) => item.subsidiaryCompany) ??
        [],
    };
  }

  private async validateRelatedCompanies(
    ids: string[],
    organizationId: string,
  ) {
    if (!ids.length) return;
    const companies = await this.prisma.company.findMany({
      where: { id: { in: ids }, organizationId },
      select: { id: true, archivedAt: true },
    });
    if (companies.length !== ids.length) {
      throw new BadRequestException(
        'All related companies must exist in the current organization',
      );
    }
    if (companies.some((company) => company.archivedAt)) {
      throw new BadRequestException(
        'Archived companies cannot be used in company hierarchy',
      );
    }
  }

  private async replaceHierarchy(
    tx: Prisma.TransactionClient,
    companyId: string,
    parentCompanyIds: string[],
    subsidiaryCompanyIds: string[],
  ) {
    const parents = [...new Set(parentCompanyIds)];
    const subsidiaries = [...new Set(subsidiaryCompanyIds)];
    if (parents.includes(companyId) || subsidiaries.includes(companyId)) {
      throw new BadRequestException('A company cannot be related to itself');
    }
    const overlap = parents.find((id) => subsidiaries.includes(id));
    if (overlap)
      throw new BadRequestException(
        'A company cannot be both parent and subsidiary directly',
      );

    await this.assertHierarchyAcyclic(tx, companyId, parents, subsidiaries);

    const reverse = await tx.companyHierarchyRelation.findFirst({
      where: {
        OR: [
          { parentCompanyId: companyId, subsidiaryCompanyId: { in: parents } },
          {
            parentCompanyId: { in: subsidiaries },
            subsidiaryCompanyId: companyId,
          },
        ],
      },
    });
    if (reverse)
      throw new BadRequestException(
        'Reverse company hierarchy relation already exists',
      );

    await tx.companyHierarchyRelation.deleteMany({
      where: {
        OR: [
          { parentCompanyId: companyId },
          { subsidiaryCompanyId: companyId },
        ],
      },
    });
    await tx.companyHierarchyRelation.createMany({
      data: [
        ...parents.map((parentCompanyId) => ({
          parentCompanyId,
          subsidiaryCompanyId: companyId,
        })),
        ...subsidiaries.map((subsidiaryCompanyId) => ({
          parentCompanyId: companyId,
          subsidiaryCompanyId,
        })),
      ],
      skipDuplicates: true,
    });
  }

  private async assertHierarchyAcyclic(
    tx: Prisma.TransactionClient,
    companyId: string,
    parents: string[],
    subsidiaries: string[],
  ) {
    const relations = await tx.companyHierarchyRelation.findMany({
      where: {
        parentCompany: {
          organizationId: (
            await tx.company.findUniqueOrThrow({
              where: { id: companyId },
              select: { organizationId: true },
            })
          ).organizationId,
        },
      },
      select: { parentCompanyId: true, subsidiaryCompanyId: true },
    });
    const graph = new Map<string, Set<string>>();
    const addEdge = (parent: string, child: string) => {
      const children = graph.get(parent) ?? new Set<string>();
      children.add(child);
      graph.set(parent, children);
    };
    for (const relation of relations) {
      if (
        relation.parentCompanyId !== companyId &&
        relation.subsidiaryCompanyId !== companyId
      ) {
        addEdge(relation.parentCompanyId, relation.subsidiaryCompanyId);
      }
    }
    const reaches = (start: string, target: string) => {
      const pending = [start];
      const visited = new Set<string>();
      while (pending.length) {
        const current = pending.pop()!;
        if (current === target) return true;
        if (visited.has(current)) continue;
        visited.add(current);
        pending.push(...(graph.get(current) ?? []));
      }
      return false;
    };
    for (const [parent, child] of [
      ...parents.map((parent) => [parent, companyId] as const),
      ...subsidiaries.map((subsidiary) => [companyId, subsidiary] as const),
    ]) {
      if (reaches(child, parent)) {
        throw new BadRequestException(
          'Company hierarchy cannot contain a cycle',
        );
      }
      addEdge(parent, child);
    }
  }
}
