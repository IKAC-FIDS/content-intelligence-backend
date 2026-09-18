import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCompanyBranchDto } from './dto/create-company-branch.dto';
import { UpdateCompanyBranchDto } from './dto/update-company-branch.dto';
import {
  CurrentUserPayload,
} from '../common/decorators/current-user.decorator';
import { CompanyAccessService } from '../companies/company-access.service';
import { FindCompanyBranchesDto } from './dto/find-company-branches.dto';
import { PaginationResponseDto } from '../common/pagination/pagination.response';
import {
  createPaginationMeta,
  getPaginationOffset,
} from '../common/pagination/pagination.util';

@Injectable()
export class CompanyBranchesService {
  constructor(
    private prisma: PrismaService,
    private companyAccess: CompanyAccessService,
  ) {}

  private async validateCompanyAccess(
    companyId: string,
    user: CurrentUserPayload,
  ) {
    await this.companyAccess.assertCompanyMutable(companyId, user);
  }

  async create(
    companyId: string,
    dto: CreateCompanyBranchDto,
    user: CurrentUserPayload,
  ) {
    await this.validateCompanyAccess(companyId, user);

    return this.prisma.companyBranch.create({
      data: {
        companyId,
        name: dto.name,
        city: dto.city,
        address: dto.address,
        phone: dto.phone,
      },
    });
  }

  async findByCompany(
    companyId: string,
    query: FindCompanyBranchesDto,
    user: CurrentUserPayload,
  ) {
    await this.validateCompanyAccess(companyId, user);

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const { skip, take } = getPaginationOffset(page, limit);
    const search = query.search?.trim();

    const where: Prisma.CompanyBranchWhereInput = {
      companyId,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { city: { contains: search, mode: 'insensitive' } },
              { address: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.companyBranch.findMany({
        where,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip,
        take,
      }),
      this.prisma.companyBranch.count({ where }),
    ]);

    return new PaginationResponseDto(
      data,
      createPaginationMeta(page, limit, total),
    );
  }

  async findOne(id: string, user: CurrentUserPayload) {
    const branch = await this.prisma.companyBranch.findUnique({
      where: { id },
      include: { company: true },
    });

    if (!branch) {
      throw new NotFoundException('شعبه پیدا نشد');
    }

    await this.validateCompanyAccess(branch.companyId, user);
    return branch;
  }

  async update(
    id: string,
    dto: UpdateCompanyBranchDto,
    user: CurrentUserPayload,
  ) {
    const branch = await this.prisma.companyBranch.findUnique({
      where: { id },
      include: { company: true },
    });

    if (!branch) {
      throw new NotFoundException('شعبه پیدا نشد');
    }

    await this.validateCompanyAccess(branch.companyId, user);

    return this.prisma.companyBranch.update({
      where: { id },
      data: {
        name: dto.name,
        city: dto.city,
        address: dto.address,
        phone: dto.phone,
      },
    });
  }

  async remove(id: string, user: CurrentUserPayload) {
    const branch = await this.prisma.companyBranch.findUnique({
      where: { id },
      include: { company: true },
    });

    if (!branch) {
      throw new NotFoundException('شعبه پیدا نشد');
    }

    await this.validateCompanyAccess(branch.companyId, user);

    return this.prisma.companyBranch.delete({
      where: { id },
    });
  }
}
