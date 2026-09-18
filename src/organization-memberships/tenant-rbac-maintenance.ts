import { PrismaClient, RoleScope } from '@prisma/client';

type Assignment = { userId: string; membershipId: string; organizationId: string; roleId: string; legacy: string[]; membership: string[] };

export class TenantRbacMaintenance {
  constructor(private readonly prisma: PrismaClient) {}

  async plan(organizationId: string) {
    const [organization, users, roles, memberships, owners] = await Promise.all([
      this.prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true, authorizationVersion: true } }),
      this.prisma.user.findMany({ where: { organizationId }, select: { id: true, role: true, roleId: true, isActive: true } }),
      this.prisma.role.findMany({ include: { permissions: { include: { permission: true } } } }),
      this.prisma.organizationMembership.findMany({ where: { organizationId }, select: { id: true, userId: true, roleId: true, status: true, isTenantOwner: true } }),
      this.prisma.organizationMembership.count({ where: { organizationId, isTenantOwner: true, status: 'ACTIVE', user: { isActive: true } } }),
    ]);
    if (!organization) throw new Error('Target organization does not exist');
    const roleMap = new Map(roles.map((role) => [role.id, role]));
    const membershipByUser = new Map<string, typeof memberships>();
    for (const membership of memberships) membershipByUser.set(membership.userId, [...(membershipByUser.get(membership.userId) ?? []), membership]);
    const conflicts: Array<{ userId?: string; code: string }> = [];
    const assignments: Assignment[] = [];
    for (const user of users) {
      const candidates = membershipByUser.get(user.id) ?? [];
      if (candidates.length !== 1) { conflicts.push({ userId: user.id, code: candidates.length ? 'MULTIPLE_TARGET_MEMBERSHIPS' : 'NO_TARGET_MEMBERSHIP' }); continue; }
      const membership = candidates[0];
      let role = membership.roleId ? roleMap.get(membership.roleId) : user.roleId ? roleMap.get(user.roleId) : undefined;
      if (!role && !user.roleId) {
        const matches = roles.filter((item) => item.isSystem && item.baseRole === user.role);
        if (matches.length === 1) role = matches[0]; else conflicts.push({ userId: user.id, code: 'AMBIGUOUS_LEGACY_ENUM_ROLE' });
      }
      if (!role) { conflicts.push({ userId: user.id, code: 'INVALID_ROLE_REFERENCE' }); continue; }
      if (role.scope === RoleScope.TENANT && role.organizationId !== organizationId) { conflicts.push({ userId: user.id, code: 'CROSS_TENANT_ROLE' }); continue; }
      const legacy = [...new Set(role.permissions.map((item) => item.permission.action))].sort();
      assignments.push({ userId: user.id, membershipId: membership.id, organizationId, roleId: role.id, legacy, membership: legacy });
    }
    return {
      organizationId, users: users.length, memberships: memberships.length, activeOwners: owners,
      roles: roles.length, systemRoles: roles.filter((role) => role.scope === RoleScope.SYSTEM).length,
      tenantRoles: roles.filter((role) => role.scope === RoleScope.TENANT).length,
      assignmentsToCreate: assignments.filter((item) => !memberships.find((m) => m.id === item.membershipId)?.roleId).length,
      alreadyMigrated: assignments.filter((item) => memberships.find((m) => m.id === item.membershipId)?.roleId === item.roleId).length,
      permissionMismatches: assignments.filter((item) => item.legacy.join('|') !== item.membership.join('|')),
      conflicts, assignments,
    };
  }

  async backfill(organizationId: string, apply: boolean) {
    const plan = await this.plan(organizationId);
    if (plan.conflicts.length || plan.permissionMismatches.length) throw new Error(`Backfill blocked: ${plan.conflicts.length} conflicts, ${plan.permissionMismatches.length} permission mismatches`);
    if (!apply) return { mode: 'dry-run', ...this.publicReport(plan) };
    await this.prisma.$transaction(async (tx) => {
      let changed = 0;
      for (const assignment of plan.assignments) changed += (await tx.organizationMembership.updateMany({ where: { id: assignment.membershipId, organizationId, roleId: null }, data: { roleId: assignment.roleId } })).count;
      if (changed) {
        await tx.organization.update({ where: { id: organizationId }, data: { authorizationVersion: { increment: 1 } } });
        await tx.auditLog.create({ data: { organizationId, entityType: 'tenant-rbac', entityId: organizationId, action: 'tenant-rbac.backfilled', metadata: { assignmentsCreated: changed } } });
      }
    });
    return { mode: 'apply', ...this.publicReport(await this.plan(organizationId)) };
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
