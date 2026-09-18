import { Prisma } from "@prisma/client";

/** Canonical current-state predicate. PipelineStage.isTerminal is authoritative. */
export function activeOpportunityStateWhere(): Prisma.OpportunityWhereInput {
  return {
    archivedAt: null,
    company: { archivedAt: null },
    stage: { isTerminal: false },
  };
}
