import { BadRequestException } from '@nestjs/common';
import {
  documentTransitions,
  knowledgeTransitions,
  releaseTransitions,
  tenderTransitions,
  assertTransition,
} from '../src/technical-center/technical-lifecycle.policy';

describe('technical lifecycle policy', () => {
  it('accepts the intended happy paths', () => {
    expect(() => assertTransition('release', releaseTransitions, 'PLANNED', 'RELEASED')).not.toThrow();
    expect(() => assertTransition('knowledge', knowledgeTransitions, 'IN_REVIEW', 'PUBLISHED')).not.toThrow();
    expect(() => assertTransition('document', documentTransitions, 'APPROVED', 'ACTIVE')).not.toThrow();
    expect(() => assertTransition('tender', tenderTransitions, 'READY_FOR_SUBMISSION', 'SUBMITTED')).not.toThrow();
  });

  it('rejects skipped and reverse terminal transitions with a structured error', () => {
    expect(() => assertTransition('release', releaseTransitions, 'DRAFT', 'RELEASED')).toThrow(BadRequestException);
    expect(() => assertTransition('document', documentTransitions, 'ACTIVE', 'DRAFT')).toThrow(BadRequestException);
    expect(() => assertTransition('tender', tenderTransitions, 'WON', 'PREPARING')).toThrow(BadRequestException);
  });

  it('allows cancellation only before a final tender result', () => {
    for (const status of ['DRAFT', 'IDENTIFIED', 'QUALIFICATION', 'PREPARING', 'TECHNICAL_REVIEW', 'COMMERCIAL_REVIEW', 'READY_FOR_SUBMISSION', 'SUBMITTED', 'UNDER_EVALUATION', 'CLARIFICATION'] as const) {
      expect(tenderTransitions[status]).toContain('CANCELLED');
    }
    expect(tenderTransitions.WON).not.toContain('CANCELLED');
  });
});
