import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import NodeCache from 'node-cache';
import type { TenantContext } from '../tenant/tenant-context.types';
import { PrismaService } from '../../prisma/prisma.service';
import {
  PERMISSIONS_KEY,
  PermissionPolicyMetadata,
} from '../decorators/permissions.decorator';

const cache = new NodeCache({ stdTTL: 600 });

type RequestUser = {
  userId?: string;
  email?: string;
  role?: UserRole;
  team?: string | null;
  teamId?: string | null;
  roleId?: string | null;
  organizationId?: string | null;
  membershipId?: string | null;
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

    const dbUser = await this.prisma.user.findUnique({
      where: { id: requestUser.userId },
      select: {
        id: true,
        role: true,
        roleId: true,
        isActive: true,
      },
    });

    if (!dbUser || !dbUser.isActive) {
      throw new ForbiddenException('حساب کاربری فعال نیست');
    }

    const discriminator = requestUser.tenantContext
      ? `${requestUser.tenantContext.organizationId}:${requestUser.userId}:${requestUser.tenantContext.membershipId}:${requestUser.tenantContext.authorizationVersion ?? 'unversioned'}`
      : `${requestUser.organizationId ?? 'legacy'}:${requestUser.membershipId ?? 'legacy'}`;
    const effectiveRoleId = requestUser.roleId ?? dbUser.roleId;
    const userPermissions = requestUser.tenantContext
      ? new Set(requestUser.tenantContext.permissions)
      : effectiveRoleId
        ? await this.getPermissionsForRoleId(effectiveRoleId, discriminator)
        : await this.getPermissionsForRole(
            requestUser.role ?? dbUser.role,
            discriminator,
          );

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

  private async getPermissionsForRole(
    role: UserRole,
    discriminator: string,
  ): Promise<Set<string>> {
    const cacheKey = `permissions:${discriminator}:${role}`;
    let permissions = cache.get<string[]>(cacheKey);

    if (!permissions) {
      const rolePermissions = await this.prisma.rolePermission.findMany({
        where: { role },
        include: { permission: true },
      });

      permissions = rolePermissions.map((rp) => rp.permission.action);
      cache.set(cacheKey, permissions);
    }

    return new Set(permissions);
  }

  private async getPermissionsForRoleId(
    roleId: string,
    discriminator: string,
  ): Promise<Set<string>> {
    const cacheKey = `permissions:${discriminator}:role:${roleId}`;
    let permissions = cache.get<string[]>(cacheKey);
    if (!permissions) {
      const rows = await this.prisma.rolePermission.findMany({
        where: { roleId, permission: { isActive: true } },
        include: { permission: true },
      });
      permissions = rows.map((item) => item.permission.action);
      cache.set(cacheKey, permissions);
    }
    return new Set(permissions);
  }

  static clearCache(role?: UserRole | string) {
    if (role) {
      const suffixes = [`:${role}`, `:role:${role}`];
      cache.del(
        cache
          .keys()
          .filter((key) => suffixes.some((suffix) => key.endsWith(suffix))),
      );
      return;
    }

    cache.flushAll();
  }
}
