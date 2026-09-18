import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { getCurrentOrganizationId } from '../common/tenant/tenant-scope.util';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreatePersonSocialDto,
  UpdatePersonSocialDto,
} from '../people/dto/person-social.dto';

@Injectable()
export class PersonSocialsService {
  constructor(private prisma: PrismaService) {}

  private async assertPersonMutable(personId: string, user: CurrentUserPayload) {
    const scopedPerson = await this.prisma.person.findFirst({
      where: { id: personId, company: { organizationId: getCurrentOrganizationId(user), archivedAt: null } },
      select: { id: true },
    });
    if (!scopedPerson) throw new NotFoundException('Person not found');
    return;
    /* Legacy owner/team authorization removed. Permission guards now authorize mutations.
    const person = await this.prisma.person.findFirst({
      where: {
        id: personId,
        company: { organizationId: getCurrentOrganizationId(user) },
      },
      include: {
        company: {
          select: {
            ownerId: true,
            owner: { select: { team: true, teamId: true } },
          },
        },
      },
    });

    if (!person) throw new NotFoundException('مخاطب پیدا نشد');

    if (user.role === UserRole.ADMIN) return;

    if (user.role === UserRole.MANAGER) {
      if (!person.company.owner || !userMatchesTeam(person.company.owner, user)) {
        throw new ForbiddenException('شما به این مخاطب دسترسی ندارید');
      }

      return;
    }

    if (user.role === UserRole.REP && person.company.ownerId !== user.userId) {
      throw new ForbiddenException('شما به این مخاطب دسترسی ندارید');
    }

    if (user.role === UserRole.BOARDS) {
      throw new ForbiddenException('شما دسترسی به مخاطبین را ندارید');
    }
    */
  }

  private async assertPersonReadable(
    personId: string,
    user: CurrentUserPayload,
  ): Promise<void> {
    const person = await this.prisma.person.findFirst({
      where: {
        id: personId,
        company: {
          organizationId: getCurrentOrganizationId(user),
          archivedAt: null,
        },
      },
      select: { id: true },
    });

    if (!person) throw new NotFoundException('Person not found');
  }

  async create(
    personId: string,
    dto: CreatePersonSocialDto,
    user: CurrentUserPayload,
  ) {
    await this.assertPersonMutable(personId, user);

    const normalizedPlatform = await this.resolveSocialPlatformReference(
      dto.platformOptionId,
      dto.platform,
      true,
    );

    const handle = dto.handle.trim();

    if (!handle) {
      throw new BadRequestException('شناسه یا لینک شبکه اجتماعی الزامی است');
    }

    await this.assertNoDuplicateSocial(
      personId,
      normalizedPlatform.platformOptionId,
      normalizedPlatform.platformCode,
      handle,
    );

    if (dto.isPrimary) {
      await this.prisma.personSocial.updateMany({
        where: { personId, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    return this.prisma.personSocial.create({
      data: {
        personId,
        platformOptionId: normalizedPlatform.platformOptionId,
        platform: normalizedPlatform.platformCode,
        handle,
        isPrimary: dto.isPrimary ?? false,
        note: dto.note?.trim() || undefined,
      },
      include: {
        platformOption: true,
      },
    });
  }

  async findByPerson(personId: string, user: CurrentUserPayload) {
    await this.assertPersonReadable(personId, user);

    return this.prisma.personSocial.findMany({
      where: { personId },
      include: {
        platformOption: true,
      },
      orderBy: [
        { isPrimary: 'desc' },
        { platform: 'asc' },
        { createdAt: 'asc' },
      ],
    });
  }

  async findOne(id: string, user: CurrentUserPayload) {
    const social = await this.prisma.personSocial.findUnique({
      where: { id },
      include: {
        person: true,
        platformOption: true,
      },
    });

    if (!social) throw new NotFoundException('شبکه اجتماعی پیدا نشد');

    await this.assertPersonReadable(social.personId, user);

    return social;
  }

  async update(
    id: string,
    dto: UpdatePersonSocialDto,
    user: CurrentUserPayload,
  ) {
    const social = await this.prisma.personSocial.findUnique({
      where: { id },
      include: {
        person: true,
        platformOption: true,
      },
    });

    if (!social) throw new NotFoundException('شبکه اجتماعی پیدا نشد');

    await this.assertPersonMutable(social.personId, user);

    const updateData: {
      platformOptionId?: string | null;
      platform?: string;
      handle?: string;
      isPrimary?: boolean;
      note?: string | null;
    } = {};

    let nextPlatformOptionId = social.platformOptionId;
    let nextPlatformCode = social.platform;
    let nextHandle = social.handle;

    if (dto.platformOptionId !== undefined || dto.platform !== undefined) {
      const normalizedPlatform = await this.resolveSocialPlatformReference(
        dto.platformOptionId,
        dto.platform,
        true,
      );

      nextPlatformOptionId = normalizedPlatform.platformOptionId;
      nextPlatformCode = normalizedPlatform.platformCode;

      updateData.platformOptionId = normalizedPlatform.platformOptionId;
      updateData.platform = normalizedPlatform.platformCode;
    }

    if (dto.handle !== undefined) {
      nextHandle = dto.handle.trim();

      if (!nextHandle) {
        throw new BadRequestException('شناسه یا لینک شبکه اجتماعی الزامی است');
      }

      updateData.handle = nextHandle;
    }

    if (dto.isPrimary !== undefined) {
      updateData.isPrimary = dto.isPrimary;
    }

    if (dto.note !== undefined) {
      updateData.note = dto.note?.trim() || null;
    }

    if (
      dto.platformOptionId !== undefined ||
      dto.platform !== undefined ||
      dto.handle !== undefined
    ) {
      await this.assertNoDuplicateSocial(
        social.personId,
        nextPlatformOptionId,
        nextPlatformCode,
        nextHandle,
        id,
      );
    }

    if (dto.isPrimary) {
      await this.prisma.personSocial.updateMany({
        where: {
          personId: social.personId,
          isPrimary: true,
          NOT: { id },
        },
        data: { isPrimary: false },
      });
    }

    return this.prisma.personSocial.update({
      where: { id },
      data: updateData,
      include: {
        platformOption: true,
      },
    });
  }

  async remove(id: string, user: CurrentUserPayload) {
    const social = await this.prisma.personSocial.findUnique({
      where: { id },
      include: { person: true },
    });

    if (!social) throw new NotFoundException('شبکه اجتماعی پیدا نشد');

    await this.assertPersonMutable(social.personId, user);

    return this.prisma.personSocial.delete({
      where: { id },
    });
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

  private async assertNoDuplicateSocial(
    personId: string,
    platformOptionId: string | null,
    platformCode: string,
    handle: string,
    excludeId?: string,
  ) {
    const duplicate = await this.prisma.personSocial.findFirst({
      where: {
        personId,
        handle,
        OR: [
          ...(platformOptionId ? [{ platformOptionId }] : []),
          { platform: platformCode },
        ],
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
    });

    if (duplicate) {
      throw new BadRequestException('این شبکه اجتماعی برای این مخاطب قبلاً ثبت شده است');
    }
  }
}
