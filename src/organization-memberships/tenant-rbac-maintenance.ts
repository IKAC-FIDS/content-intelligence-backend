import { OrganizationMembershipStatus, PrismaClient, RoleScope, UserRole } from '@prisma/client';

const OWNER_MANAGEMENT_PERMISSIONS = ['role:manage', 'user:manage'];

export type RbacAuditStatus =
  | 'EXACT_MATCH'
  | 'ROLE_ASSIGNMENT_MISSING'
  | 'ROLE_NOT_FOUND'
  | 'ROLE_INACTIVE'
  | 'ROLE_SCOPE_INVALID'
  | 'ROLE_CROSS_TENANT'
  | 'CUSTOM_ROLE'
  | 'PERMISSION_SETS_DIVERGE';

type Assignment = { userId: string; membershipId: string; organizationId: string; roleId: string };

const sorted = (values: Iterable<string>) => [...new Set(values)].sort();
const difference = (left: string[], right: string[]) => left.filter((value) => !new Set(right).has(value));

export class TenantRbacMaintenance {
  constructor(private readonly prisma: PrismaClient) {}

  async plan(organizationId: string) {
    const organization = await this.prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true, authorizationVersion: true } });
    if (!organization) throw new Error('Target organization does not exist');

    const [memberships, roles, enumGrants, platformAuthorities] = await Promise.all([
      this.prisma.organizationMembership.findMany({
        where: { organizationId },
        select: {
          id: true, userId: true, organizationId: true, roleId: true, status: true, isTenantOwner: true,
          user: {
            select: {
              id: true, role: true, roleId: true, isActive: true,
              assignedRole: { select: { id: true, isActive: true, scope: true, organizationId: true, permissions: { where: { permission: { isActive: true } }, select: { permission: { select: { action: true } } } } } },
            },
          },
          role: { select: { id: true, code: true, normalizedCode: true, baseRole: true, isActive: true, scope: true, organizationId: true, permissions: { where: { permission: { isActive: true } }, select: { permission: { select: { action: true } } } } } },
        },
        orderBy: { id: 'asc' },
      }),
      this.prisma.role.findMany({
        select: { id: true, baseRole: true, isActive: true, scope: true, organizationId: true, permissions: { where: { permission: { isActive: true } }, select: { permission: { select: { action: true } } } } },
      }),
      this.prisma.rolePermission.findMany({ where: { role: { not: null }, permission: { isActive: true } }, select: { role: true, permission: { select: { action: true } } } }),
      this.prisma.platformAuthority.findMany({ select: { userId: true } }),
    ]);

    const userIds = [...new Set(memberships.map((membership) => membership.userId))];
    const membershipCounts = userIds.length
      ? await this.prisma.organizationMembership.groupBy({ by: ['userId'], where: { userId: { in: userIds } }, _count: { _all: true } })
      : [];
    const countByUser = new Map(membershipCounts.map((row) => [row.userId, row._count._all]));
    const platformUsers = new Set(platformAuthorities.map((authority) => authority.userId));
    const roleById = new Map(roles.map((role) => [role.id, role]));
    const enumPermissions = new Map<UserRole, string[]>();
    for (const grant of enumGrants) {
      if (!grant.role) continue;
      enumPermissions.set(grant.role, [...(enumPermissions.get(grant.role) ?? []), grant.permission.action]);
    }

    const assignments: Assignment[] = [];
    const audits = memberships.map((membership) => {
      const diagnostics: string[] = [];
      const targetRole = membership.role;
      let status: RbacAuditStatus = 'EXACT_MATCH';
      if (!membership.roleId) status = 'ROLE_ASSIGNMENT_MISSING';
      else if (!targetRole) status = 'ROLE_NOT_FOUND';
      else if (!targetRole.isActive) status = 'ROLE_INACTIVE';
      else if ((targetRole.scope === RoleScope.SYSTEM && targetRole.organizationId !== null) || (targetRole.scope === RoleScope.TENANT && targetRole.organizationId === null)) status = 'ROLE_SCOPE_INVALID';
      else if (targetRole.scope === RoleScope.TENANT && targetRole.organizationId !== membership.organizationId) status = 'ROLE_CROSS_TENANT';

      if (!membership.user.roleId) diagnostics.push('LEGACY_ROLE_ID_MISSING');
      else if (membership.user.roleId !== membership.roleId) diagnostics.push('LEGACY_ROLE_ID_DIFFERENT');
      if ((countByUser.get(membership.userId) ?? 0) > 1) diagnostics.push('MULTI_TENANT_LEGACY_AMBIGUITY');
      if (platformUsers.has(membership.userId)) diagnostics.push('PLATFORM_AUTHORITY_PRESENT');
      if (membership.user.role === UserRole.ADMIN && !platformUsers.has(membership.userId)) diagnostics.push('TENANT_ADMIN_WITHOUT_PLATFORM_AUTHORITY');

      const legacyEnumPermissions = sorted(enumPermissions.get(membership.user.role) ?? []);
      const legacyRoleIdPermissions = sorted(membership.user.assignedRole?.permissions.map((grant) => grant.permission.action) ?? []);
      const legacyPermissions = membership.user.roleId ? legacyRoleIdPermissions : legacyEnumPermissions;
      const roleIdPermissions = sorted(targetRole?.permissions.map((grant) => grant.permission.action) ?? []);
      const legacyOnly = difference(legacyPermissions, roleIdPermissions);
      const roleIdOnly = difference(roleIdPermissions, legacyPermissions);

      const structurallyValid = status === 'EXACT_MATCH';
      const customRole = structurallyValid && targetRole?.scope === RoleScope.TENANT;
      if (customRole) {
        status = 'CUSTOM_ROLE';
        diagnostics.push('CUSTOM_ROLE', 'NO_LEGACY_EQUIVALENT');
      }
      if (structurallyValid && !legacyOnly.length && !roleIdOnly.length) diagnostics.push('PERMISSIONS_MATCH');
      if (legacyOnly.length) diagnostics.push('LEGACY_HAS_EXTRA_PERMISSIONS');
      if (roleIdOnly.length) diagnostics.push('ROLE_ID_HAS_EXTRA_PERMISSIONS');
      if (legacyOnly.length && roleIdOnly.length) diagnostics.push('PERMISSION_SETS_DIVERGE');
      if (structurallyValid && !customRole && (legacyOnly.length || roleIdOnly.length)) status = 'PERMISSION_SETS_DIVERGE';

      const ownerMissingPermissions = membership.isTenantOwner
        ? OWNER_MANAGEMENT_PERMISSIONS.filter((permission) => !roleIdPermissions.includes(permission))
        : [];
      if (membership.isTenantOwner && !structurallyValid) diagnostics.push('OWNER_WITHOUT_USABLE_ROLE');
      if (ownerMissingPermissions.length) diagnostics.push('OWNER_MANAGEMENT_PERMISSIONS_UNVERIFIED');

      if (status === 'ROLE_ASSIGNMENT_MISSING' && !diagnostics.includes('MULTI_TENANT_LEGACY_AMBIGUITY')) {
        const candidates = membership.user.roleId
          ? [roleById.get(membership.user.roleId)].filter(Boolean)
          : roles.filter((role) => role.scope === RoleScope.SYSTEM && role.organizationId === null && role.isActive && role.baseRole === membership.user.role);
        const valid = candidates.filter((role) => role && role.isActive && ((role.scope === RoleScope.SYSTEM && role.organizationId === null) || (role.scope === RoleScope.TENANT && role.organizationId === membership.organizationId)));
        if (valid.length === 1) {
          const candidatePermissions = sorted(valid[0]!.permissions.map((grant) => grant.permission.action));
          if (!difference(legacyPermissions, candidatePermissions).length && !difference(candidatePermissions, legacyPermissions).length) assignments.push({ userId: membership.userId, membershipId: membership.id, organizationId, roleId: valid[0]!.id });
          else diagnostics.push('AMBIGUOUS_PERMISSION_RECONCILIATION');
        } else diagnostics.push('AMBIGUOUS_ROLE_RECONCILIATION');
      }

      return {
        membershipId: membership.id, userId: membership.userId, organizationId: membership.organizationId,
        membershipStatus: membership.status, isTenantOwner: membership.isTenantOwner, membershipRoleId: membership.roleId,
        legacyUserRole: membership.user.role, legacyUserRoleId: membership.user.roleId,
        role: targetRole ? { id: targetRole.id, scope: targetRole.scope, organizationId: targetRole.organizationId, isActive: targetRole.isActive, baseRole: targetRole.baseRole } : null,
        status, diagnostics: sorted(diagnostics), legacyPermissionSource: membership.user.roleId ? 'USER_ROLE_ID' : 'USER_ROLE_ENUM',
        legacyPermissions, roleIdPermissions, legacyOnly, roleIdOnly, ownerMissingPermissions,
      };
    });

    const assignableMemberships = new Set(assignments.map((assignment) => assignment.membershipId));
    const conflicts = audits
      .filter((audit) => audit.status !== 'EXACT_MATCH' && audit.status !== 'CUSTOM_ROLE' && !(audit.status === 'ROLE_ASSIGNMENT_MISSING' && assignableMemberships.has(audit.membershipId)))
      .map((audit) => ({ userId: audit.userId, membershipId: audit.membershipId, code: audit.status }));
    const permissionMismatches = audits.filter((audit) => audit.legacyOnly.length || audit.roleIdOnly.length);
    return {
      mode: 'dry-run', organizationId, memberships: memberships.length,
      activeOwners: memberships.filter((membership) => membership.isTenantOwner && membership.status === OrganizationMembershipStatus.ACTIVE && membership.user.isActive).length,
      assignmentsToCreate: assignments.length,
      exactMatches: audits.filter((audit) => audit.status === 'EXACT_MATCH').length,
      customRoles: audits.filter((audit) => audit.status === 'CUSTOM_ROLE').length,
      permissionMismatches, conflicts, audits, assignments,
      platformAuthorityInference: false,
    };
  }

  async backfill(organizationId: string, apply: boolean) {
    const plan = await this.plan(organizationId);
    if (!apply) return { ...this.publicReport(plan), mode: 'dry-run', status: plan.conflicts.length || plan.permissionMismatches.length ? 'blocked' : 'ready' };
    if (plan.conflicts.length || plan.permissionMismatches.length) throw new Error(`Backfill blocked: ${plan.conflicts.length} conflicts, ${plan.permissionMismatches.length} permission mismatches`);
    await this.prisma.$transaction(async (tx) => {
      let changed = 0;
      for (const assignment of plan.assignments) changed += (await tx.organizationMembership.updateMany({ where: { id: assignment.membershipId, organizationId, roleId: null }, data: { roleId: assignment.roleId } })).count;
      if (changed) {
        await tx.organization.update({ where: { id: organizationId }, data: { authorizationVersion: { increment: 1 } } });
        await tx.auditLog.create({ data: { organizationId, entityType: 'tenant-rbac', entityId: organizationId, action: 'tenant-rbac.backfilled', metadata: { assignmentsCreated: changed } } });
      }
    });
    return { ...this.publicReport(await this.plan(organizationId)), mode: 'apply' };
  }

  async validate(organizationId: string) {
    const plan = await this.plan(organizationId);
    const invalidScopes = await this.prisma.role.count({ where: { OR: [{ scope: RoleScope.SYSTEM, organizationId: { not: null } }, { scope: RoleScope.TENANT, organizationId: null }] } });
    const missingRoles = await this.prisma.organizationMembership.count({ where: { organizationId, status: 'ACTIVE', roleId: null } });
    return { valid: !plan.conflicts.length && !plan.permissionMismatches.length && invalidScopes === 0 && missingRoles === 0, invalidScopes, activeMembershipsWithoutRole: missingRoles, ...this.publicReport(plan) };
  }

  private publicReport(plan: Awaited<ReturnType<TenantRbacMaintenance['plan']>>) {
    const { assignments: _assignments, ...report } = plan;
    return report;
  }
}

function argument(name: string) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; }
async function main() {
  const command = process.argv[2];
  const organizationId = argument('--organization');
  if (!organizationId) throw new Error('--organization <uuid> is required; broad backfill is intentionally unsupported');
  const prisma = new PrismaClient();
  try {
    const tool = new TenantRbacMaintenance(prisma);
    const result = command === 'preflight' ? await tool.plan(organizationId) : command === 'validate' ? await tool.validate(organizationId) : command === 'backfill' ? await tool.backfill(organizationId, process.argv.includes('--confirm-apply') && !process.argv.includes('--dry-run')) : (() => { throw new Error('Expected preflight, backfill, or validate'); })();
    const { assignments: _assignments, ...safe } = result as any;
    process.stdout.write(`${JSON.stringify(safe, null, 2)}\n`);
  } finally { await prisma.$disconnect(); }
}
if (require.main === module) void main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
