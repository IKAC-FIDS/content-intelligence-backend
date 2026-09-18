import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, QuotaMetric, UserRole } from '@prisma/client';
import { ActivityType } from '../activities/activity-type';
import { randomUUID } from 'node:crypto';
import { PipelineConfigService } from '../admin/pipeline/pipeline-config.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { ArchiveOpportunityDto } from './dto/archive-opportunity.dto';
import { ChangeOpportunityOwnerDto } from './dto/change-opportunity-owner.dto';
import { ChangeOpportunityStageDto } from './dto/change-opportunity-stage.dto';
import { CreateOpportunityDto } from './dto/create-opportunity.dto';
import { FindOpportunitiesDto } from './dto/find-opportunities.dto';
import { UpdateOpportunityDto } from './dto/update-opportunity.dto';
import {
  getCurrentOrganizationId,
  tenantScope,
} from '../common/tenant/tenant-scope.util';
import {
  userMatchesTeam,
  userTeamScopeWhere,
} from '../common/tenant/team-scope.util';
import { parseApiDate, parseApiDateRange } from '../common/dates/api-date.util';
import { OwnershipScope } from '../common/dto/ownership-scope.dto';
import { activeOpportunityStateWhere } from '../common/opportunities/active-opportunity-scope';
import { QuotaService } from '../quota/quota.service';
import { NotificationCoreService } from '../notification-core/notification-core.service';

const opportunityInclude = {
  company: {
    select: {
      id: true,
      legalName: true,
      brandName: true,
      industry: true,
    },
  },
  owner: {
    select: {
      id: true,
      fullName: true,
      email: true,
      team: true,
    },
  },
  stage: {
    select: {
      id: true,
      code: true,
      label: true,
      sortOrder: true,
      color: true,
      isTerminal: true,
      terminalType: true,
    },
  },
  sourceOption: {
    select: {
      id: true,
      code: true,
      label: true,
    },
  },
  primaryContact: {
    select: {
      id: true,
      fullName: true,
      title: true,
      department: true,
      email: true,
      phone: true,
      isPrimaryContact: true,
    },
  },
  _count: {
    select: {
      lineItems: true,
      commercialDocuments: true,
      payments: true,
      tasks: true,
    },
  },
  commercialDocuments: {
    orderBy: [{ createdAt: 'desc' }],
    include: {
      payments: {
        select: {
          id: true,
          status: true,
          amount: true,
          currency: true,
          dueDate: true,
          paidAt: true,
          method: true,
          referenceNumber: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      },
    },
  },

  payments: {
    orderBy: [{ createdAt: 'desc' }],
    include: {
      commercialDocument: {
        select: {
          id: true,
          type: true,
          status: true,
          number: true,
          title: true,
        },
      },
    },
  },
} satisfies Prisma.OpportunityInclude;

@Injectable()
export class OpportunitiesService {
  constructor(
    private prisma: PrismaService,
    private pipelineConfig: PipelineConfigService,
    private audit: AuditLogService,
    private quota: QuotaService,
    private notificationCore: NotificationCoreService,
  ) {}

  async findAll(query: FindOpportunitiesDto, user: CurrentUserPayload) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = this.buildWhere(query, user);

    const [data, total] = await Promise.all([
      this.prisma.opportunity.findMany({
        where,
        include: opportunityInclude,
        orderBy: {
          updatedAt: 'desc',
        },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.opportunity.count({ where }),
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

  findByCompany(
    companyId: string,
    query: FindOpportunitiesDto,
    user: CurrentUserPayload,
  ) {
    return this.findAll({ ...query, companyId }, user);
  }

  async findOne(id: string, user: CurrentUserPayload) {
    const opportunity = await this.prisma.opportunity.findFirst({
      where: {
        AND: [{ id }, { organizationId: getCurrentOrganizationId(user) }],
      },
      include: {
        ...opportunityInclude,

        stageHistories: {
          include: {
            fromStage: {
              select: {
                id: true,
                code: true,
                label: true,
              },
            },
            toStage: {
              select: {
                id: true,
                code: true,
                label: true,
              },
            },
          },
          orderBy: {
            changedAt: 'desc',
          },
        },

        activities: {
          orderBy: {
            occurredAt: 'desc',
          },
          take: 20,
        },

        lineItems: {
          include: {
            product: {
              select: {
                id: true,
                code: true,
                name: true,
                category: true,
                unit: true,
                defaultUnitPrice: true,
                currency: true,
                isActive: true,
              },
            },
          },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },

        commercialDocuments: {
          orderBy: [{ createdAt: 'desc' }],
          include: {
            payments: {
              select: {
                id: true,
                status: true,
                amount: true,
                currency: true,
                dueDate: true,
                paidAt: true,
                method: true,
                referenceNumber: true,
              },
              orderBy: {
                createdAt: 'desc',
              },
            },
          },
        },

        payments: {
          orderBy: [{ createdAt: 'desc' }],
          include: {
            commercialDocument: {
              select: {
                id: true,
                type: true,
                status: true,
                number: true,
                title: true,
              },
            },
          },
        },

        tasks: {
          include: {
            assignedTo: {
              select: {
                id: true,
                fullName: true,
                email: true,
                role: true,
                team: true,
              },
            },
            createdBy: {
              select: {
                id: true,
                fullName: true,
                email: true,
              },
            },
          },
          orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
        },
      },
    });

    if (!opportunity) {
      throw new NotFoundException('Opportunity not found');
    }

    return opportunity;
  }

  async create(dto: CreateOpportunityDto, user: CurrentUserPayload) {
    const company = await this.getCompanyInScope(dto.companyId, user);
    const stage = await this.resolveStage(dto.stageId, dto.stage);
    const ownerId = dto.ownerId ?? user.userId;
    const source = await this.resolveOpportunitySource(
      dto.sourceOptionId,
      dto.opportunitySource,
      dto.source,
    );

    if (dto.ownerId) {
      await this.validateOwner(dto.ownerId, user);
    }

    if (dto.primaryContactId) {
      await this.validatePrimaryContact(dto.primaryContactId, company.id);
    }

    const reservation = await this.quota.reserve(
      company.organizationId,
      QuotaMetric.OPPORTUNITIES,
      1n,
      `opportunity:create:${randomUUID()}`,
      new Date(),
      user.userId,
      user.tenantContext?.requestId,
    );
    let opportunity;
    try {
      opportunity = await this.prisma.opportunity.create({
        data: {
          organizationId: company.organizationId,
          companyId: company.id,
          ownerId,
          title: dto.title.trim(),
          description: dto.description,
          stageId: stage.id,
          priority: dto.priority,
          estimatedValue: dto.estimatedValue,
          expectedCloseDate: dto.expectedCloseDate
            ? parseApiDate(dto.expectedCloseDate, 'expectedCloseDate')
            : undefined,
          sourceOptionId: source.sourceOptionId,
          source: source.source,
          primaryContactId: dto.primaryContactId,
          probability: dto.probability,
          competitor: dto.competitor?.trim() || undefined,
          wonAt: stage.terminalType === 'WON' ? new Date() : undefined,
          lostAt: stage.terminalType === 'LOST' ? new Date() : undefined,
          stageHistories: {
            create: {
              fromStageId: null,
              toStageId: stage.id,
              changedById: user.userId,
            },
          },
        },
        include: opportunityInclude,
      });
    } catch (error) {
      await this.quota.releaseReservation(reservation.reservationId);
      throw error;
    }
    await this.quota.commitReservation(reservation.reservationId);

    await this.audit.record({
      actorId: user.userId,
      entityType: 'opportunity',
      entityId: opportunity.id,
      action: 'opportunity.created',
      after: opportunity,
    });

    return opportunity;
  }

  async update(
    id: string,
    dto: UpdateOpportunityDto,
    user: CurrentUserPayload,
  ) {
    const current = await this.getForMutation(id, user);
    const source =
      dto.sourceOptionId !== undefined ||
      dto.opportunitySource !== undefined ||
      dto.source !== undefined
        ? await this.resolveOpportunitySource(
            dto.sourceOptionId,
            dto.opportunitySource,
            dto.source,
          )
        : undefined;

    if (dto.primaryContactId) {
      await this.validatePrimaryContact(
        dto.primaryContactId,
        current.companyId,
      );
    }

    const {
      sourceOptionId,
      opportunitySource,
      source: legacySource,
      primaryContactId,
      ...rest
    } = dto;

    void sourceOptionId;
    void opportunitySource;
    void legacySource;

    const updated = await this.prisma.opportunity.update({
      where: { id },
      data: {
        ...rest,
        ...(dto.title !== undefined && {
          title: dto.title.trim(),
        }),
        ...(dto.expectedCloseDate !== undefined && {
          expectedCloseDate: parseApiDate(
            dto.expectedCloseDate,
            'expectedCloseDate',
          ),
        }),
        ...(source !== undefined && {
          sourceOptionId: source.sourceOptionId,
          source: source.source,
        }),
        ...(primaryContactId !== undefined && {
          primaryContactId,
        }),
        ...(dto.competitor !== undefined && {
          competitor: dto.competitor?.trim() || null,
        }),
      },
      include: opportunityInclude,
    });
    await this.audit.record({
      actorId: user.userId,
      entityType: 'opportunity',
      entityId: id,
      action: 'opportunity.updated',
      before: current,
      after: updated,
    });

    return updated;
  }

  async changeStage(
    id: string,
    dto: ChangeOpportunityStageDto,
    user: CurrentUserPayload,
  ) {
    const current = await this.getForMutation(id, user);

    if (current.archivedAt) {
      throw new BadRequestException(
        'Archived opportunities cannot change stage',
      );
    }

    if (!dto.stageId && !dto.stage) {
      throw new BadRequestException('stageId or stage code is required');
    }

    const target = await this.resolveStage(dto.stageId, dto.stage);

    await this.pipelineConfig.assertTransitionAllowed(
      current.stageId,
      target.id,
      user.role as UserRole,
    );

    const now = new Date();

    const [updated] = await this.prisma.$transaction([
      this.prisma.opportunity.update({
        where: { id },
        data: {
          stageId: target.id,
          wonAt: target.terminalType === 'WON' ? now : null,
          lostAt: target.terminalType === 'LOST' ? now : null,
        },
        include: opportunityInclude,
      }),

      this.prisma.opportunityStageHistory.create({
        data: {
          opportunityId: id,
          fromStageId: current.stageId,
          toStageId: target.id,
          changedById: user.userId,
          note: dto.note,
        },
      }),

      this.prisma.activity.create({
        data: {
          companyId: current.companyId,
          opportunityId: id,
          userId: user.userId,
          type: ActivityType.STAGE_CHANGE,
          notes: dto.note,
          outcome: `${current.stage.code} -> ${target.code}`,
        },
      }),
    ]);

    await this.audit.record({
      actorId: user.userId,
      entityType: 'opportunity',
      entityId: id,
      action: 'opportunity.stage_changed',
      before: {
        stageId: current.stageId,
        code: current.stage.code,
      },
      after: {
        stageId: target.id,
        code: target.code,
      },
      metadata: {
        note: dto.note,
      },
    });

    await this.notificationCore.publishDomainEvent({
      organizationId: getCurrentOrganizationId(user),
      eventName: 'OPPORTUNITY.STAGE_CHANGED',
      aggregateType: 'OPPORTUNITY',
      aggregateId: id,
      actorId: user.userId,
      idempotencyKey: `OPPORTUNITY.STAGE_CHANGED:${id}:${updated.updatedAt.toISOString()}`,
      payload: { fromStage: current.stage.code, toStage: target.code },
    });

    return updated;
  }

  async changeOwner(
    id: string,
    dto: ChangeOpportunityOwnerDto,
    user: CurrentUserPayload,
  ) {
    const current = await this.getForMutation(id, user);

    if (dto.ownerId) {
      await this.validateOwner(dto.ownerId, user);
    }

    const updated = await this.prisma.opportunity.update({
      where: { id },
      data: {
        ownerId: dto.ownerId,
      },
      include: opportunityInclude,
    });

    await this.audit.record({
      actorId: user.userId,
      entityType: 'opportunity',
      entityId: id,
      action: 'opportunity.owner_changed',
      before: {
        ownerId: current.ownerId,
      },
      after: {
        ownerId: updated.ownerId,
      },
    });

    return updated;
  }

  async archive(
    id: string,
    dto: ArchiveOpportunityDto,
    user: CurrentUserPayload,
  ) {
    const current = await this.getForMutation(id, user);

    if (current.archivedAt) {
      throw new BadRequestException('Opportunity is already archived');
    }

    const updated = await this.prisma.opportunity.update({
      where: { id },
      data: {
        archivedAt: new Date(),
        archivedById: user.userId,
        archiveReason: dto.reason,
      },
      include: opportunityInclude,
    });
    await this.quota.synchronizeInventory(
      getCurrentOrganizationId(user),
      QuotaMetric.OPPORTUNITIES,
    );

    await this.audit.record({
      actorId: user.userId,
      entityType: 'opportunity',
      entityId: id,
      action: 'opportunity.archived',
      before: current,
      after: updated,
    });

    return updated;
  }

  async restore(id: string, user: CurrentUserPayload) {
    const current = await this.getForMutation(id, user);

    if (!current.archivedAt) {
      throw new BadRequestException('Opportunity is not archived');
    }

    const reservation = await this.quota.reserve(
      getCurrentOrganizationId(user),
      QuotaMetric.OPPORTUNITIES,
      1n,
      `opportunity:restore:${id}`,
      new Date(),
      user.userId,
      user.tenantContext?.requestId,
    );
    let updated;
    try {
      updated = await this.prisma.opportunity.update({
        where: { id },
        data: {
          archivedAt: null,
          archivedById: null,
          archiveReason: null,
        },
        include: opportunityInclude,
      });
    } catch (error) {
      await this.quota.releaseReservation(reservation.reservationId);
      throw error;
    }
    await this.quota.commitReservation(reservation.reservationId);

    await this.audit.record({
      actorId: user.userId,
      entityType: 'opportunity',
      entityId: id,
      action: 'opportunity.restored',
      before: current,
      after: updated,
    });

    return updated;
  }

  private buildWhere(
    query: FindOpportunitiesDto,
    user: CurrentUserPayload,
  ): Prisma.OpportunityWhereInput {
    if (query.activeOnly === 'true' && query.archivedOnly === 'true') {
      throw new BadRequestException(
        'activeOnly=true cannot be combined with archivedOnly=true',
      );
    }
    const and: Prisma.OpportunityWhereInput[] = [
      {
        organizationId: getCurrentOrganizationId(user),
      },
      this.readOwnershipScopeWhere(query.ownershipScope, user),
      {
        company: {
          archivedAt: null,
        },
      },
    ];

    if (query.companyId) {
      and.push({
        companyId: query.companyId,
      });
    }

    if (query.ownerId) {
      and.push({
        ownerId: query.ownerId,
      });
    }

    if (query.teamId) {
      and.push({
        owner: {
          teamId: query.teamId,
        },
      });
    }

    if (query.team?.trim()) {
      and.push({
        owner: {
          OR: [
            { team: query.team.trim() },
            {
              teamRef: {
                code: { equals: query.team.trim(), mode: 'insensitive' },
              },
            },
            {
              teamRef: {
                name: { equals: query.team.trim(), mode: 'insensitive' },
              },
            },
          ],
        },
      });
    }

    if (query.stage) {
      and.push({
        stage: {
          code: query.stage.trim().toUpperCase(),
        },
      });
    }

    if (query.stageId) {
      and.push({
        stageId: query.stageId,
      });
    }

    if (query.priority) {
      and.push({
        priority: query.priority,
      });
    }

    if (query.source?.trim()) {
      const source = query.source.trim();
      and.push({
        OR: [
          { source },
          { sourceOption: { code: { equals: source, mode: 'insensitive' } } },
          { sourceOption: { label: { equals: source, mode: 'insensitive' } } },
        ],
      });
    }

    if (query.opportunitySource?.trim()) {
      const source = query.opportunitySource.trim();
      and.push({
        OR: [
          { source },
          { sourceOption: { code: { equals: source, mode: 'insensitive' } } },
          { sourceOption: { label: { equals: source, mode: 'insensitive' } } },
        ],
      });
    }

    if (query.sourceOptionId) {
      and.push({
        sourceOptionId: query.sourceOptionId,
      });
    }

    if (query.primaryContactId) {
      and.push({
        primaryContactId: query.primaryContactId,
      });
    }

    const expectedCloseRange = parseApiDateRange(
      query.expectedCloseFrom,
      query.expectedCloseTo,
      'expectedCloseFrom',
      'expectedCloseTo',
    );
    if (expectedCloseRange) {
      and.push({ expectedCloseDate: expectedCloseRange });
    }

    if (query.activeOnly === 'true') {
      and.push(activeOpportunityStateWhere());
    } else if (query.archivedOnly === 'true') {
      and.push({
        archivedAt: {
          not: null,
        },
      });
    } else if (query.includeArchived !== 'true') {
      and.push({
        archivedAt: null,
      });
    }

    const search = query.search?.trim();

    if (search) {
      and.push({
        OR: [
          {
            title: {
              contains: search,
              mode: 'insensitive',
            },
          },
          {
            description: {
              contains: search,
              mode: 'insensitive',
            },
          },
          {
            company: {
              legalName: {
                contains: search,
                mode: 'insensitive',
              },
            },
          },
          {
            company: {
              brandName: {
                contains: search,
                mode: 'insensitive',
              },
            },
          },
          {
            owner: {
              fullName: {
                contains: search,
                mode: 'insensitive',
              },
            },
          },
          {
            owner: {
              email: {
                contains: search,
                mode: 'insensitive',
              },
            },
          },
        ],
      });
    }

    return {
      AND: and,
    };
  }

  private readOwnershipScopeWhere(
    scope: OwnershipScope | undefined,
    user: CurrentUserPayload,
  ): Prisma.OpportunityWhereInput {
    switch (scope ?? OwnershipScope.ALL) {
      case OwnershipScope.MINE:
        return {
          OR: [{ ownerId: user.userId }, { company: { ownerId: user.userId } }],
        };
      case OwnershipScope.TEAM:
        return { owner: userTeamScopeWhere(user) };
      case OwnershipScope.UNASSIGNED:
        return { ownerId: null };
      default:
        return {};
    }
  }

  private mutationScopeWhere(
    user: CurrentUserPayload,
  ): Prisma.OpportunityWhereInput {
    if (user.role === UserRole.ADMIN || user.role === UserRole.BOARDS) {
      return {};
    }

    if (user.role === UserRole.MANAGER) {
      return user.teamId || user.team
        ? {
            company: {
              owner: userTeamScopeWhere(user),
            },
          }
        : {
            id: {
              in: [],
            },
          };
    }

    return {
      OR: [
        {
          ownerId: user.userId,
        },
        {
          company: {
            ownerId: user.userId,
          },
        },
      ],
    };
  }

  private async getForMutation(id: string, user: CurrentUserPayload) {
    if (user.role === UserRole.BOARDS) {
      throw new ForbiddenException('Opportunity is read-only for this role');
    }

    const item = await this.prisma.opportunity.findFirst({
      where: {
        AND: [
          { id },
          { organizationId: getCurrentOrganizationId(user) },
          this.mutationScopeWhere(user),
        ],
      },
      include: opportunityInclude,
    });

    if (!item) {
      throw new NotFoundException('Opportunity not found');
    }

    return item;
  }

  private async getCompanyInScope(companyId: string, user: CurrentUserPayload) {
    const company = await this.prisma.company.findFirst({
      where: {
        id: companyId,
        organizationId: getCurrentOrganizationId(user),
      },
      include: {
        owner: {
          select: {
            team: true,
            teamId: true,
          },
        },
      },
    });

    if (!company || company.archivedAt) {
      throw new NotFoundException('Company not found');
    }

    return company;
  }

  private async validateOwner(ownerId: string, user: CurrentUserPayload) {
    const owner = await this.prisma.user.findFirst({
      where: {
        id: ownerId,
        ...tenantScope.activeMembership(user),
      },
    });

    if (
      !owner ||
      !owner.isActive ||
      (owner.role !== UserRole.REP && owner.role !== UserRole.MANAGER)
    ) {
      throw new BadRequestException(
        'Opportunity owner must be an active REP or MANAGER',
      );
    }

    if (user.role === UserRole.REP && owner.id !== user.userId) {
      throw new ForbiddenException('REP can only assign opportunities to self');
    }

    if (user.role === UserRole.MANAGER && !userMatchesTeam(owner, user)) {
      throw new ForbiddenException('Owner must belong to the manager team');
    }
  }

  private async resolveOpportunitySource(
    sourceOptionId?: string,
    opportunitySource?: string,
    legacySource?: string,
  ): Promise<{ sourceOptionId?: string | null; source?: string | null }> {
    if (sourceOptionId) {
      const option = await this.prisma.lookupOption.findFirst({
        where: {
          id: sourceOptionId,
          group: 'opportunity-sources',
          isActive: true,
        },
      });

      if (!option) {
        throw new BadRequestException(
          'Selected opportunity source is invalid or inactive',
        );
      }

      return {
        sourceOptionId: option.id,
        source: option.code,
      };
    }

    const normalizedSource = (opportunitySource ?? legacySource)?.trim();

    if (!normalizedSource) {
      return {};
    }

    const option = await this.prisma.lookupOption.findFirst({
      where: {
        group: 'opportunity-sources',
        isActive: true,
        OR: [
          {
            code: {
              equals: normalizedSource,
              mode: 'insensitive',
            },
          },
          {
            label: {
              equals: normalizedSource,
              mode: 'insensitive',
            },
          },
        ],
      },
    });

    if (option) {
      return {
        sourceOptionId: option.id,
        source: option.code,
      };
    }

    if (opportunitySource) {
      throw new BadRequestException(
        'Opportunity source must be selected from opportunity-sources lookup options',
      );
    }

    return {
      sourceOptionId: undefined,
      source: normalizedSource,
    };
  }

  private async validatePrimaryContact(
    primaryContactId: string,
    companyId: string,
  ) {
    const contact = await this.prisma.person.findFirst({
      where: {
        id: primaryContactId,
        companyId,
      },
      select: {
        id: true,
      },
    });

    if (!contact) {
      throw new BadRequestException(
        'Primary contact must belong to the opportunity company',
      );
    }
  }

  private async getDefaultStage() {
    const config = await this.prisma.pipelineStage.findFirst({
      where: {
        isActive: true,
        isDefault: true,
      },
      orderBy: {
        sortOrder: 'asc',
      },
    });

    if (!config) {
      throw new BadRequestException(
        'No active initial pipeline stage is configured',
      );
    }

    return config;
  }

  private async resolveStage(stageId?: string, code?: string) {
    if (!stageId && !code) {
      return this.getDefaultStage();
    }

    const stage = await this.prisma.pipelineStage.findFirst({
      where: stageId
        ? {
            id: stageId,
          }
        : {
            code: code!.trim().toUpperCase(),
          },
    });

    if (!stage?.isActive) {
      throw new BadRequestException('Selected pipeline stage is not active');
    }

    return stage;
  }
}
