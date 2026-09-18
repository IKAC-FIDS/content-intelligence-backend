import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { CurrentUserPayload } from "../common/decorators/current-user.decorator";
import { activeOpportunityStateWhere } from "../common/opportunities/active-opportunity-scope";
import { OwnershipScope } from "../common/dto/ownership-scope.dto";
import { getCurrentOrganizationId } from "../common/tenant/tenant-scope.util";
import {
  userTeamFilterWhere,
  userTeamScopeWhere,
} from "../common/tenant/team-scope.util";
import { ReportFiltersDto } from "./dto/report-filters.dto";
@Injectable()
export class ReportingScopeService {
  company(
    f: ReportFiltersDto,
    user: CurrentUserPayload,
  ): Prisma.CompanyWhereInput {
    return {
      AND: [
        { organizationId: getCurrentOrganizationId(user), archivedAt: null },
        ...(f.companyIds?.length ? [{ id: { in: f.companyIds } }] : []),
        ...(f.ownerIds?.length ? [{ ownerId: { in: f.ownerIds } }] : []),
        ...(f.teams?.length ? [{ owner: userTeamFilterWhere(f.teams) }] : []),
        ...this.companyOwnership(f.ownershipScope, user),
      ],
    };
  }
  opportunity(
    f: ReportFiltersDto,
    user: CurrentUserPayload,
    active = false,
  ): Prisma.OpportunityWhereInput {
    return {
      AND: [
        {
          organizationId: getCurrentOrganizationId(user),
          company: { archivedAt: null },
        },
        ...(active ? [activeOpportunityStateWhere()] : []),
        ...(f.companyIds?.length ? [{ companyId: { in: f.companyIds } }] : []),
        ...(f.ownerIds?.length ? [{ ownerId: { in: f.ownerIds } }] : []),
        ...(f.teams?.length ? [{ owner: userTeamFilterWhere(f.teams) }] : []),
        ...(f.stages?.length
          ? [
              {
                OR: [
                  { stageId: { in: f.stages } },
                  {
                    stage: {
                      code: { in: f.stages.map((x) => x.toUpperCase()) },
                    },
                  },
                ],
              },
            ]
          : []),
        ...(f.priorities?.length ? [{ priority: { in: f.priorities } }] : []),
        ...(f.industries?.length
          ? [{ company: { industry: { in: f.industries } } }]
          : []),
        ...(f.sources?.length ? [{ source: { in: f.sources } }] : []),
        ...this.opportunityOwnership(f.ownershipScope, user),
      ],
    };
  }
  private companyOwnership(
    scope: OwnershipScope | undefined,
    user: CurrentUserPayload,
  ): Prisma.CompanyWhereInput[] {
    return scope === OwnershipScope.MINE
      ? [{ ownerId: user.userId }]
      : scope === OwnershipScope.TEAM
        ? [{ owner: userTeamScopeWhere(user) }]
        : scope === OwnershipScope.UNASSIGNED
          ? [{ ownerId: null }]
          : [];
  }
  private opportunityOwnership(
    scope: OwnershipScope | undefined,
    user: CurrentUserPayload,
  ): Prisma.OpportunityWhereInput[] {
    return scope === OwnershipScope.MINE
      ? [
          {
            OR: [
              { ownerId: user.userId },
              { company: { ownerId: user.userId } },
            ],
          },
        ]
      : scope === OwnershipScope.TEAM
        ? [{ owner: userTeamScopeWhere(user) }]
        : scope === OwnershipScope.UNASSIGNED
          ? [{ ownerId: null }]
          : [];
  }
}
