import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCompanySocialChannelDto } from './dto/create-company-social-channel.dto';
import { UpdateCompanySocialChannelDto } from './dto/update-company-social-channel.dto';
import {
  CurrentUserPayload,
} from '../common/decorators/current-user.decorator';
import { CompanyAccessService } from '../companies/company-access.service';
import { FindCompanySocialChannelsDto } from './dto/find-company-social-channels.dto';
import { PaginationResponseDto } from '../common/pagination/pagination.response';
import {
  createPaginationMeta,
  getPaginationOffset,
} from '../common/pagination/pagination.util';

@Injectable()
export class CompanySocialChannelsService {
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
    dto: CreateCompanySocialChannelDto,
    user: CurrentUserPayload,
  ) {
    await this.validateCompanyAccess(companyId, user);

    return this.prisma.companySocialChannel.create({
      data: {
        companyId,
        platform: dto.platform,
        handle: dto.handle,
      },
    });
  }

  async findByCompany(
    companyId: string,
    query: FindCompanySocialChannelsDto,
    user: CurrentUserPayload,
  ) {
    await this.validateCompanyAccess(companyId, user);

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const { skip, take } = getPaginationOffset(page, limit);
    const search = query.search?.trim();

    const where: Prisma.CompanySocialChannelWhereInput = {
      companyId,
      ...(query.platform ? { platform: query.platform } : {}),
      ...(search
        ? {
            handle: {
              contains: search,
              mode: 'insensitive',
            },
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.companySocialChannel.findMany({
        where,
        orderBy: [{ platform: 'asc' }, { id: 'asc' }],
        skip,
        take,
      }),
      this.prisma.companySocialChannel.count({ where }),
    ]);

    return new PaginationResponseDto(
      data,
      createPaginationMeta(page, limit, total),
    );
  }

  async findOne(id: string, user: CurrentUserPayload) {
    const channel = await this.prisma.companySocialChannel.findUnique({
      where: { id },
      include: { company: true },
    });

    if (!channel) {
      throw new NotFoundException('کانال اجتماعی پیدا نشد');
    }

    await this.validateCompanyAccess(channel.companyId, user);
    return channel;
  }

  async update(
    id: string,
    dto: UpdateCompanySocialChannelDto,
    user: CurrentUserPayload,
  ) {
    const channel = await this.prisma.companySocialChannel.findUnique({
      where: { id },
      include: { company: true },
    });

    if (!channel) {
      throw new NotFoundException('کانال اجتماعی پیدا نشد');
    }

    await this.validateCompanyAccess(channel.companyId, user);

    return this.prisma.companySocialChannel.update({
      where: { id },
      data: {
        platform: dto.platform,
        handle: dto.handle,
      },
    });
  }

  async remove(id: string, user: CurrentUserPayload) {
    const channel = await this.prisma.companySocialChannel.findUnique({
      where: { id },
      include: { company: true },
    });

    if (!channel) {
      throw new NotFoundException('کانال اجتماعی پیدا نشد');
    }

    await this.validateCompanyAccess(channel.companyId, user);

    return this.prisma.companySocialChannel.delete({
      where: { id },
    });
  }
}
