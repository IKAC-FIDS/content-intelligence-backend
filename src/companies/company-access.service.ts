import { Injectable, NotFoundException } from '@nestjs/common';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { getCurrentOrganizationId } from '../common/tenant/tenant-scope.util';
import { PrismaService } from '../prisma/prisma.service';

export type CompanyAccessOptions = {
  allowArchived?: boolean;
};

@Injectable()
export class CompanyAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async getCompanyInOrganizationOrThrow(
    companyId: string,
    user: CurrentUserPayload,
    options: CompanyAccessOptions = {},
  ) {
    const company = await this.prisma.company.findFirst({
      where: {
        id: companyId,
        organizationId: getCurrentOrganizationId(user),
        ...(!options.allowArchived && { archivedAt: null }),
      },
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    return company;
  }

  assertCompanyReadable(companyId: string, user: CurrentUserPayload) {
    return this.getCompanyInOrganizationOrThrow(companyId, user);
  }

  assertCompanyMutable(
    companyId: string,
    user: CurrentUserPayload,
    options: CompanyAccessOptions = {},
  ) {
    return this.getCompanyInOrganizationOrThrow(companyId, user, options);
  }
}
