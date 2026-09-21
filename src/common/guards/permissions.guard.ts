import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { TenantContext } from '../tenant/tenant-context.types';
import { PrismaService } from '../../prisma/prisma.service';
import {
  PERMISSIONS_KEY,
  PermissionPolicyMetadata,
} from '../decorators/permissions.decorator';

type RequestUser = {
  userId?: string;
  email?: string;
  tenantContext?: TenantContext;
};

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const policy = this.reflector.getAllAndOverride<
      PermissionPolicyMetadata | string[] | undefined
    >(PERMISSIONS_KEY, [context.getHandler(), context.getClass()]);

    const normalizedPolicy = this.normalizePolicy(policy);

    if (!normalizedPolicy || normalizedPolicy.actions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const requestUser = request.user as RequestUser | undefined;

    if (!requestUser?.userId) {
      throw new ForbiddenException('کاربر احراز هویت نشده است');
    }

    if (!requestUser.tenantContext) {
      throw new ForbiddenException('Tenant context is required for permission authorization');
    }

    const dbUser = await this.prisma.user.findUnique({
      where: { id: requestUser.userId },
      select: {
        id: true,
        isActive: true,
      },
    });

    if (!dbUser || !dbUser.isActive) {
      throw new ForbiddenException('حساب کاربری فعال نیست');
    }

    const userPermissions = new Set(requestUser.tenantContext.permissions);

    const allowed =
      normalizedPolicy.mode === 'any'
        ? normalizedPolicy.actions.some((permission) =>
            userPermissions.has(permission),
          )
        : normalizedPolicy.actions.every((permission) =>
            userPermissions.has(permission),
          );

    if (!allowed) {
      const missingPermissions = normalizedPolicy.actions.filter(
        (permission) => !userPermissions.has(permission),
      );

      throw new ForbiddenException(
        `شما دسترسی لازم برای این عملیات را ندارید: ${missingPermissions.join(', ')}`,
      );
    }

    return true;
  }

  private normalizePolicy(
    policy: PermissionPolicyMetadata | string[] | undefined,
  ): PermissionPolicyMetadata | null {
    if (!policy) {
      return null;
    }

    if (Array.isArray(policy)) {
      return {
        actions: policy,
        mode: 'all',
      };
    }

    return {
      actions: policy.actions ?? [],
      mode: policy.mode ?? 'all',
    };
  }

  /**
   * Kept temporarily for source compatibility with detached writers.
   * Tenant permissions are carried by the versioned TenantContext, so this
   * guard no longer owns a role permission cache.
   */
  static clearCache(_role?: string) {
    return;
  }
}
