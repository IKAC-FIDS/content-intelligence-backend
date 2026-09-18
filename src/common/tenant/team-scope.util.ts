import { Prisma } from '@prisma/client';
import { CurrentUserPayload } from '../decorators/current-user.decorator';

export function hasTeamScope(user: CurrentUserPayload): boolean {
  return Boolean(user.teamId || user.team);
}

export function userTeamScopeWhere(user: CurrentUserPayload): Prisma.UserWhereInput {
  const or: Prisma.UserWhereInput[] = [];

  if (user.teamId) {
    or.push({ teamId: user.teamId });
  }

  if (user.team) {
    or.push({ team: user.team });
  }

  return or.length ? { OR: or } : { id: { in: [] } };
}

export function userTeamFilterWhere(values: string[]): Prisma.UserWhereInput {
  const normalized = values.map((value) => value.trim()).filter(Boolean);

  if (!normalized.length) {
    return {};
  }

  return {
    OR: [
      { teamId: { in: normalized } },
      { team: { in: normalized } },
      { teamRef: { code: { in: normalized } } },
      { teamRef: { name: { in: normalized } } },
    ],
  };
}

export function userMatchesTeam(
  candidate: { teamId?: string | null; team?: string | null },
  user: CurrentUserPayload,
): boolean {
  return Boolean(
    (user.teamId && candidate.teamId === user.teamId) ||
      (user.team && candidate.team === user.team),
  );
}
