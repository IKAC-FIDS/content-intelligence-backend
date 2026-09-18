import { BadRequestException } from '@nestjs/common';
import {
  KnowledgeBaseStatus,
  TechnicalDocumentStatus,
  TechnicalReleaseStatus,
  TenderStatus,
} from '@prisma/client';

type Graph<T extends string> = Readonly<Record<T, readonly T[]>>;

export const releaseTransitions: Graph<TechnicalReleaseStatus> = {
  DRAFT: ['PLANNED', 'ARCHIVED'],
  PLANNED: ['DRAFT', 'RELEASED', 'ARCHIVED'],
  RELEASED: ['DEPRECATED', 'ARCHIVED'],
  DEPRECATED: ['END_OF_LIFE', 'ARCHIVED'],
  END_OF_LIFE: ['ARCHIVED'],
  ARCHIVED: [],
};

export const knowledgeTransitions: Graph<KnowledgeBaseStatus> = {
  DRAFT: ['IN_REVIEW', 'ARCHIVED'],
  IN_REVIEW: ['DRAFT', 'PUBLISHED', 'ARCHIVED'],
  PUBLISHED: ['IN_REVIEW', 'ARCHIVED'],
  ARCHIVED: [],
};

export const documentTransitions: Graph<TechnicalDocumentStatus> = {
  DRAFT: ['IN_REVIEW', 'ARCHIVED'],
  IN_REVIEW: ['DRAFT', 'APPROVED', 'ARCHIVED'],
  APPROVED: ['ACTIVE', 'ARCHIVED'],
  ACTIVE: ['SUPERSEDED', 'EXPIRED', 'ARCHIVED'],
  SUPERSEDED: ['ARCHIVED'],
  EXPIRED: ['ARCHIVED'],
  ARCHIVED: [],
};

const cancellable: TenderStatus[] = [
  'DRAFT', 'IDENTIFIED', 'QUALIFICATION', 'PREPARING', 'TECHNICAL_REVIEW',
  'COMMERCIAL_REVIEW', 'READY_FOR_SUBMISSION', 'SUBMITTED', 'UNDER_EVALUATION',
  'CLARIFICATION',
];
export const tenderTransitions: Graph<TenderStatus> = {
  DRAFT: ['IDENTIFIED', 'CANCELLED'],
  IDENTIFIED: ['QUALIFICATION', 'CANCELLED'],
  QUALIFICATION: ['PREPARING', 'CANCELLED'],
  PREPARING: ['TECHNICAL_REVIEW', 'CANCELLED'],
  TECHNICAL_REVIEW: ['PREPARING', 'COMMERCIAL_REVIEW', 'CANCELLED'],
  COMMERCIAL_REVIEW: ['TECHNICAL_REVIEW', 'READY_FOR_SUBMISSION', 'CANCELLED'],
  READY_FOR_SUBMISSION: ['COMMERCIAL_REVIEW', 'SUBMITTED', 'CANCELLED'],
  SUBMITTED: ['UNDER_EVALUATION', 'CANCELLED'],
  UNDER_EVALUATION: ['CLARIFICATION', 'WON', 'LOST', 'CANCELLED'],
  CLARIFICATION: ['UNDER_EVALUATION', 'CANCELLED'],
  WON: ['ARCHIVED'],
  LOST: ['ARCHIVED'],
  CANCELLED: ['ARCHIVED'],
  ARCHIVED: [],
};

if (!cancellable.every((status) => tenderTransitions[status].includes('CANCELLED'))) {
  throw new Error('Tender cancellation lifecycle is incomplete');
}

export function assertTransition<T extends string>(
  entity: string,
  graph: Graph<T>,
  from: T,
  to: T,
) {
  if (!graph[from]?.includes(to)) {
    throw new BadRequestException({
      code: 'INVALID_LIFECYCLE_TRANSITION',
      message: `Invalid ${entity} transition from ${from} to ${to}`,
      details: { entity, from, to, allowed: graph[from] ?? [] },
    });
  }
}
