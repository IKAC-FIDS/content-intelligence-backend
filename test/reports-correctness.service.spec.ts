import { UserRole } from '@prisma/client';
import { OwnershipScope } from '../src/common/dto/ownership-scope.dto';
import { ReportsService } from '../src/reports/reports.service';
import { tenantUser } from './helpers/tenant-user';
const organizationId = '00000000-0000-4000-8000-000000000001';
const user = tenantUser({ userId: 'user-1', email: 'a@example.com', role: UserRole.ADMIN, organizationId });
const range = { gte: new Date('2026-07-01T00:00:00.000Z'), lt: new Date('2026-08-01T00:00:00.000Z') };

describe('ReportsService correctness filters', () => {
  it('applies opportunity.createdAt, companyIds and ownershipScope to pipeline summary', async () => {
    const prisma = { opportunity: { groupBy: jest.fn().mockResolvedValue([]) }, pipelineStage: { findMany: jest.fn().mockResolvedValue([]) } };
    const result = await new ReportsService(prisma as any).getPipelineSummary({ startDate: '2026-07-01', endDate: '2026-07-31', companyIds: ['00000000-0000-4000-8000-000000000010'], ownershipScope: OwnershipScope.MINE }, user as any);
    expect(prisma.opportunity.groupBy.mock.calls[0][0].where.AND).toEqual(expect.arrayContaining([{ organizationId }, { companyId: { in: ['00000000-0000-4000-8000-000000000010'] } }, { OR: [{ ownerId: user.userId }, { company: { ownerId: user.userId } }] }, { createdAt: range }]));
    expect(result.summary.totalCompanies).toBe(0); expect(result.period.dateBasis).toBe('OPPORTUNITY_CREATED_AT');
  });

  it('applies opportunity.createdAt to pipeline by owner', async () => {
    const prisma = { opportunity: { findMany: jest.fn().mockResolvedValue([]) }, pipelineStage: { findMany: jest.fn().mockResolvedValue([]) } };
    await new ReportsService(prisma as any).getPipelineByOwner({ startDate: '2026-07-01', endDate: '2026-07-31' }, user as any);
    expect(prisma.opportunity.findMany.mock.calls[0][0].where.AND[0].AND).toContainEqual({ createdAt: range });
  });

  it('uses changedAt and distinct opportunity denominators for conversion', async () => {
    const prisma = {
      pipelineStageTransition: { findMany: jest.fn().mockResolvedValue([{ fromStageId: null, toStageId: 'open', fromStage: null, toStage: { code: 'OPEN', label: 'Open', sortOrder: 1 } }]) },
      opportunityStageHistory: {
        groupBy: jest.fn().mockResolvedValue([{ fromStageId: null, toStageId: 'open', _count: { opportunityId: 3 } }]),
        findMany: jest.fn().mockResolvedValueOnce([{ opportunityId: 'o1' }, { opportunityId: 'o2' }]).mockResolvedValueOnce([{ opportunityId: 'o1', toStageId: 'open' }, { opportunityId: 'o2', toStageId: 'open' }]).mockResolvedValueOnce([{ opportunityId: 'o2' }]),
      },
    };
    const result = await new ReportsService(prisma as any).getConversionRates({ startDate: '2026-07-01', endDate: '2026-07-31' }, user as any);
    expect(prisma.opportunityStageHistory.groupBy.mock.calls[0][0].where.changedAt).toEqual(range);
    expect(result.summary.totalOpportunities).toBe(2); expect(result.summary.wonOpportunities).toBe(1); expect(result.summary.overallOpportunityConversionRate).toBe(50); expect(result.stages[0].fromCount).toBe(2);
    expect(result.period.dateBasis).toBe('STAGE_TRANSITION_CHANGED_AT');
  });

  it('filters stage-duration samples by exit date without truncating pre-period entry', async () => {
    const prisma = { opportunityStageHistory: { findMany: jest.fn().mockResolvedValue([
      { opportunityId: 'o1', fromStageId: null, fromStage: null, changedAt: new Date('2026-06-20T00:00:00Z') },
      { opportunityId: 'o1', fromStageId: 'open', fromStage: { id: 'open', code: 'OPEN', label: 'Open', sortOrder: 1 }, changedAt: new Date('2026-07-05T00:00:00Z') },
      { opportunityId: 'o1', fromStageId: 'next', fromStage: { id: 'next', code: 'NEXT', label: 'Next', sortOrder: 2 }, changedAt: new Date('2026-08-05T00:00:00Z') },
    ]) }, pipelineStage: { findMany: jest.fn().mockResolvedValue([{ id: 'open', code: 'OPEN', label: 'Open', sortOrder: 1 }, { id: 'next', code: 'NEXT', label: 'Next', sortOrder: 2 }]) } };
    const result = await new ReportsService(prisma as any).getAverageStageDuration({ startDate: '2026-07-01', endDate: '2026-07-31' }, user as any);
    expect(result).toHaveLength(1); expect(result[0].stage).toBe('OPEN'); expect(result[0].avg_duration_days).toBe(15);
    expect(prisma.opportunityStageHistory.findMany.mock.calls[0][0].where).not.toHaveProperty('changedAt');
  });
});
