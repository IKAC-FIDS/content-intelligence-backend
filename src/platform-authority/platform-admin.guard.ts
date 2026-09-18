import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import type { PlatformScopeContext } from '../common/tenant/tenant-context.types';

type PlatformRequest = Request & {
  user?: { userId?: string };
  requestId?: string;
  platformContext?: PlatformScopeContext;
};

@Injectable()
export class PlatformAdminGuard extends AuthGuard('platform-jwt') {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const authenticated = await super.canActivate(context);
    if (!authenticated) return false;

    const request = context.switchToHttp().getRequest<PlatformRequest>();
    const userId = request.user?.userId;
    if (!userId) {
      throw new ForbiddenException('Platform administration access denied');
    }
    const authority = await this.prisma.platformAuthority.findUnique({
      where: { userId },
      select: { role: true, user: { select: { isActive: true } } },
    });
    if (!authority?.user.isActive || authority.role !== 'PLATFORM_ADMIN') {
      throw new ForbiddenException('Platform administration access denied');
    }

    request.platformContext = {
      userId,
      platformAdmin: true,
      platformRole: authority.role,
      requestId: request.requestId ?? null,
    };
    return true;
  }
}
