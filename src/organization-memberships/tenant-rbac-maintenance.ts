import { OrganizationMembershipStatus, PrismaClient, RoleScope, UserRole } from '@prisma/client';

const OWNER_PERMISSIONS = ['role:manage', 'user:manage'];
export type ReconciliationOutcome = 'SAFE_NO_CHANGE' | 'SAFE_ASSIGN_ROLE' | 'MANUAL_PERMISSION_DIVERGENCE' | 'MANUAL_MULTI_TENANT_AMBIGUITY' | 'MANUAL_CROSS_TENANT_ROLE' | 'MANUAL_INVALID_ROLE' | 'MANUAL_OWNER_RISK' | 'MANUAL_LEGACY_CONFLICT' | 'BLOCKED';
type Assignment = { userId: string; membershipId: string; organizationId: string; roleId: string; userRole: UserRole; userRoleId: string | null; membershipCount: number; permissions: string[] };
const sorted = (values: Iterable<string>) => [...new Set(values)].sort();
const difference = (left: string[], right: string[]) => { const set = new Set(right); return left.filter((value) => !set.has(value)); };
const same = (left: string[], right: string[]) => left.length === right.length && left.every((value, index) => value === right[index]);
const validRole = (role: { isActive: boolean; scope: RoleScope; organizationId: string | null }, organizationId: string) => role.isActive && ((role.scope === RoleScope.SYSTEM && role.organizationId === null) || (role.scope === RoleScope.TENANT && role.organizationId === organizationId));

export class TenantRbacMaintenance {
  constructor(private readonly prisma: PrismaClient) {}

  async plan(organizationId: string) {
    const organization = await this.prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true } });
    if (!organization) throw new Error('Target organization does not exist');
    const [memberships, roles, enumGrants, authorities] = await Promise.all([
      this.prisma.organizationMembership.findMany({ where: { organizationId }, select: {
        id: true, userId: true, organizationId: true, roleId: true, status: true, isTenantOwner: true,
        user: { select: { role: true, roleId: true, isActive: true, assignedRole: { select: { id: true, permissions: { where: { permission: { isActive: true } }, select: { permission: { select: { action: true } } } } } } } },
        role: { select: { id: true, baseRole: true, isActive: true, scope: true, organizationId: true, permissions: { where: { permission: { isActive: true } }, select: { permission: { select: { action: true } } } } } },
      }, orderBy: { id: 'asc' } }),
      this.prisma.role.findMany({ select: { id: true, baseRole: true, isActive: true, scope: true, organizationId: true, permissions: { where: { permission: { isActive: true } }, select: { permission: { select: { action: true } } } } } }),
      this.prisma.rolePermission.findMany({ where: { role: { not: null }, permission: { isActive: true } }, select: { role: true, permission: { select: { action: true } } } }),
      this.prisma.platformAuthority.findMany({ select: { userId: true } }),
    ]);
    const userIds = [...new Set(memberships.map((item) => item.userId))];
    const counts = userIds.length ? await this.prisma.organizationMembership.groupBy({ by: ['userId'], where: { userId: { in: userIds } }, _count: { _all: true } }) : [];
    const countByUser = new Map(counts.map((item) => [item.userId, item._count._all]));
    const roleById = new Map(roles.map((role) => [role.id, role]));
    const platformUsers = new Set(authorities.map((item) => item.userId));
    const enumPermissions = new Map<UserRole, string[]>();
    for (const grant of enumGrants) if (grant.role) enumPermissions.set(grant.role, [...(enumPermissions.get(grant.role) ?? []), grant.permission.action]);
    const assignments: Assignment[] = [];
    const audits = memberships.map((membership) => {
      const diagnostics: string[] = [];
      const role = membership.role;
      let status = 'EXACT_MATCH';
      if (!membership.roleId) status = 'ROLE_ASSIGNMENT_MISSING';
      else if (!role) status = 'ROLE_NOT_FOUND';
      else if (!role.isActive) status = 'ROLE_INACTIVE';
      else if ((role.scope === RoleScope.SYSTEM && role.organizationId !== null) || (role.scope === RoleScope.TENANT && role.organizationId === null)) status = 'ROLE_SCOPE_INVALID';
      else if (role.scope === RoleScope.TENANT && role.organizationId !== organizationId) status = 'ROLE_CROSS_TENANT';
      const membershipCount = countByUser.get(membership.userId) ?? 0;
      const multiTenantAmbiguity = membershipCount > 1;
      if (!membership.user.roleId) diagnostics.push('LEGACY_ROLE_ID_MISSING'); else if (membership.user.roleId !== membership.roleId) diagnostics.push('LEGACY_ROLE_ID_DIFFERENT');
      if (multiTenantAmbiguity) diagnostics.push('MULTI_TENANT_LEGACY_AMBIGUITY');
      if (platformUsers.has(membership.userId)) diagnostics.push('PLATFORM_AUTHORITY_PRESENT');
      if (membership.user.role === UserRole.ADMIN && !platformUsers.has(membership.userId)) diagnostics.push('TENANT_ADMIN_WITHOUT_PLATFORM_AUTHORITY');
      const legacyPermissions = sorted(membership.user.roleId ? (membership.user.assignedRole?.permissions.map((item) => item.permission.action) ?? []) : (enumPermissions.get(membership.user.role) ?? []));
      const roleIdPermissions = sorted(role?.permissions.map((item) => item.permission.action) ?? []);
      const legacyOnly = difference(legacyPermissions, roleIdPermissions), roleIdOnly = difference(roleIdPermissions, legacyPermissions);
      const structurallyValid = status === 'EXACT_MATCH';
      const customRole = structurallyValid && role?.scope === RoleScope.TENANT;
      if (customRole) { status = 'CUSTOM_ROLE'; diagnostics.push('CUSTOM_ROLE', 'NO_LEGACY_EQUIVALENT'); }
      if (structurallyValid && !legacyOnly.length && !roleIdOnly.length) diagnostics.push('PERMISSIONS_MATCH');
      if (legacyOnly.length) diagnostics.push('LEGACY_HAS_EXTRA_PERMISSIONS');
      if (roleIdOnly.length) diagnostics.push('ROLE_ID_HAS_EXTRA_PERMISSIONS');
      if (legacyOnly.length && roleIdOnly.length) diagnostics.push('PERMISSION_SETS_DIVERGE');
      if (structurallyValid && !customRole && (legacyOnly.length || roleIdOnly.length)) status = 'PERMISSION_SETS_DIVERGE';
      const ownerMissingPermissions = membership.isTenantOwner ? OWNER_PERMISSIONS.filter((permission) => !roleIdPermissions.includes(permission)) : [];
      if (membership.isTenantOwner && !structurallyValid) diagnostics.push('OWNER_WITHOUT_USABLE_ROLE');
      if (ownerMissingPermissions.length) diagnostics.push('OWNER_MANAGEMENT_PERMISSIONS_UNVERIFIED');
      let candidate: (typeof roles)[number] | undefined;
      let reconciliationOutcome: ReconciliationOutcome;
      if (membership.isTenantOwner && (!structurallyValid || ownerMissingPermissions.length)) reconciliationOutcome = 'MANUAL_OWNER_RISK';
      else if (status === 'ROLE_CROSS_TENANT') reconciliationOutcome = 'MANUAL_CROSS_TENANT_ROLE';
      else if (['ROLE_NOT_FOUND', 'ROLE_INACTIVE', 'ROLE_SCOPE_INVALID'].includes(status)) reconciliationOutcome = 'MANUAL_INVALID_ROLE';
      else if (status === 'PERMISSION_SETS_DIVERGE') reconciliationOutcome = 'MANUAL_PERMISSION_DIVERGENCE';
      else if (status !== 'ROLE_ASSIGNMENT_MISSING') reconciliationOutcome = 'SAFE_NO_CHANGE';
      else if (multiTenantAmbiguity) reconciliationOutcome = 'MANUAL_MULTI_TENANT_AMBIGUITY';
      else {
        const candidates = membership.user.roleId ? [roleById.get(membership.user.roleId)].filter((item): item is (typeof roles)[number] => Boolean(item)) : roles.filter((item) => item.scope === RoleScope.SYSTEM && item.organizationId === null && item.isActive && item.baseRole === membership.user.role);
        const valid = candidates.filter((item) => validRole(item, organizationId));
        if (valid.length === 1) {
          candidate = valid[0];
          const candidatePermissions = sorted(candidate.permissions.map((item) => item.permission.action));
          if (same(legacyPermissions, candidatePermissions)) {
            reconciliationOutcome = 'SAFE_ASSIGN_ROLE';
            assignments.push({ userId: membership.userId, membershipId: membership.id, organizationId, roleId: candidate.id, userRole: membership.user.role, userRoleId: membership.user.roleId, membershipCount, permissions: candidatePermissions });
          } else { reconciliationOutcome = 'MANUAL_LEGACY_CONFLICT'; diagnostics.push('AMBIGUOUS_PERMISSION_RECONCILIATION'); }
        } else { reconciliationOutcome = 'MANUAL_LEGACY_CONFLICT'; diagnostics.push('AMBIGUOUS_ROLE_RECONCILIATION'); }
      }
      return { membershipId: membership.id, userId: membership.userId, organizationId, membershipStatus: membership.status, isTenantOwner: membership.isTenantOwner, membershipRoleId: membership.roleId, candidateRoleId: candidate?.id ?? null, role: role ? { id: role.id, scope: role.scope, organizationId: role.organizationId, isActive: role.isActive, baseRole: role.baseRole } : null, status, reconciliationOutcome, legacyPermissions, roleIdPermissions, legacyOnly, roleIdOnly, diagnostics: sorted(diagnostics), ownerMissingPermissions, ownerRisk: reconciliationOutcome === 'MANUAL_OWNER_RISK', multiTenantAmbiguity, automaticWrite: reconciliationOutcome === 'SAFE_ASSIGN_ROLE' };
    });
    return this.report(organizationId, memberships, audits, assignments);
  }

  async backfill(organizationId: string, apply: boolean) {
    const plan = await this.plan(organizationId);
    if (!apply) return { ...this.publicReport(plan), mode: 'dry-run' as const };
    const stalePlans: Array<{ membershipId: string; outcome: 'STALE_PLAN'; reason: string }> = [];
    let applied = 0;
    await this.prisma.$transaction(async (tx) => {
      for (const assignment of plan.assignments) {
        const current = await tx.organizationMembership.findUnique({ where: { id: assignment.membershipId }, select: { id: true, userId: true, organizationId: true, roleId: true, user: { select: { role: true, roleId: true } } } });
        const candidate = await tx.role.findUnique({ where: { id: assignment.roleId }, select: { id: true, isActive: true, scope: true, organizationId: true, permissions: { where: { permission: { isActive: true } }, select: { permission: { select: { action: true } } } } } });
        const membershipCount = current ? await tx.organizationMembership.count({ where: { userId: current.userId } }) : -1;
        const reason = !current ? 'MEMBERSHIP_NOT_FOUND' : current.userId !== assignment.userId || current.organizationId !== organizationId ? 'MEMBERSHIP_IDENTITY_CHANGED' : current.roleId !== null ? 'MEMBERSHIP_ROLE_CHANGED' : current.user.role !== assignment.userRole || current.user.roleId !== assignment.userRoleId ? 'LEGACY_SOURCE_CHANGED' : membershipCount !== assignment.membershipCount ? 'MEMBERSHIP_COUNT_CHANGED' : !candidate || !validRole(candidate, organizationId) ? 'CANDIDATE_ROLE_CHANGED' : !same(sorted(candidate.permissions.map((item) => item.permission.action)), assignment.permissions) ? 'CANDIDATE_PERMISSIONS_CHANGED' : null;
        if (reason) { stalePlans.push({ membershipId: assignment.membershipId, outcome: 'STALE_PLAN', reason }); continue; }
        const changed = await tx.organizationMembership.updateMany({ where: { id: assignment.membershipId, userId: assignment.userId, organizationId, roleId: null }, data: { roleId: assignment.roleId } });
        if (changed.count !== 1) { stalePlans.push({ membershipId: assignment.membershipId, outcome: 'STALE_PLAN', reason: 'CONCURRENT_WRITE' }); continue; }
        applied += 1;
      }
      if (applied) {
        await tx.organization.update({ where: { id: organizationId }, data: { authorizationVersion: { increment: 1 } } });
        await tx.auditLog.create({ data: { organizationId, entityType: 'tenant-rbac', entityId: organizationId, action: 'tenant-rbac.reconciled', metadata: { assignmentsCreated: applied, stalePlans: stalePlans.length } } });
      }
    });
    const verification = this.publicReport(await this.plan(organizationId));
    if (stalePlans.length) {
      verification.summary.blockedOrStale += stalePlans.length;
      verification.perOrganization[0].blockedOrStale += stalePlans.length;
      verification.readiness = {
        status: 'NOT_READY_FOR_FALLBACK_REMOVAL',
        reasons: [...verification.readiness.reasons, { reason: 'STALE_PLANS', count: stalePlans.length }],
      };
    }
    return { ...verification, mode: 'apply' as const, applyResult: { applied, stalePlans } };
  }

  async validate(organizationId: string) { const plan = await this.plan(organizationId); return { valid: plan.readiness.status === 'READY_FOR_FALLBACK_REMOVAL', ...this.publicReport(plan) }; }

  private report(organizationId: string, memberships: any[], audits: any[], assignments: Assignment[]) {
    const count = (outcome: ReconciliationOutcome) => audits.filter((item) => item.reconciliationOutcome === outcome).length;
    const summary = { totalMemberships: audits.length, safeNoChange: count('SAFE_NO_CHANGE'), safeAssignments: count('SAFE_ASSIGN_ROLE'), manualPermissionDivergences: count('MANUAL_PERMISSION_DIVERGENCE'), multiTenantAmbiguities: audits.filter((item) => item.multiTenantAmbiguity).length, invalidRoles: count('MANUAL_INVALID_ROLE'), crossTenantRoles: count('MANUAL_CROSS_TENANT_ROLE'), ownerRisks: count('MANUAL_OWNER_RISK'), legacyConflicts: count('MANUAL_LEGACY_CONFLICT'), blockedOrStale: count('BLOCKED'), remainingNullRoleIds: audits.filter((item) => item.membershipRoleId === null).length };
    const reasons = Object.entries({ REMAINING_NULL_ROLE_IDS: summary.remainingNullRoleIds, INVALID_ROLES: summary.invalidRoles, CROSS_TENANT_ROLES: summary.crossTenantRoles, PERMISSION_DIVERGENCES: summary.manualPermissionDivergences, MULTI_TENANT_AMBIGUITIES: summary.multiTenantAmbiguities, OWNER_RISKS: summary.ownerRisks, LEGACY_CONFLICTS: summary.legacyConflicts }).filter(([, value]) => value > 0).map(([reason, value]) => ({ reason, count: value }));
    return { mode: 'dry-run' as const, organizationId, memberships: memberships.length, activeOwners: memberships.filter((item) => item.isTenantOwner && item.status === OrganizationMembershipStatus.ACTIVE && item.user.isActive).length, assignmentsToCreate: assignments.length, exactMatches: audits.filter((item) => item.status === 'EXACT_MATCH').length, customRoles: audits.filter((item) => item.status === 'CUSTOM_ROLE').length, permissionMismatches: audits.filter((item) => item.legacyOnly.length || item.roleIdOnly.length), conflicts: audits.filter((item) => !['SAFE_NO_CHANGE', 'SAFE_ASSIGN_ROLE'].includes(item.reconciliationOutcome)), summary, perOrganization: [{ organizationId, ...summary }], readiness: { status: reasons.length ? 'NOT_READY_FOR_FALLBACK_REMOVAL' : 'READY_FOR_FALLBACK_REMOVAL', reasons }, audits, assignments, platformAuthorityInference: false };
  }
  private publicReport(plan: Awaited<ReturnType<TenantRbacMaintenance['plan']>>) { const { assignments: _assignments, ...report } = plan; return report; }
}

function argument(name: string) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; }
async function main() {
  const command = process.argv[2], organizationId = argument('--organization');
  if (!organizationId) throw new Error('--organization <uuid> is required; broad backfill is intentionally unsupported');
  const prisma = new PrismaClient();
  try { const tool = new TenantRbacMaintenance(prisma); const result = command === 'preflight' ? await tool.plan(organizationId) : command === 'validate' ? await tool.validate(organizationId) : command === 'backfill' ? await tool.backfill(organizationId, process.argv.includes('--confirm-apply') && !process.argv.includes('--dry-run')) : (() => { throw new Error('Expected preflight, backfill, or validate'); })(); const { assignments: _assignments, ...safe } = result as any; process.stdout.write(`${JSON.stringify(safe, null, 2)}\n`); }
  finally { await prisma.$disconnect(); }
}
if (require.main === module) void main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
