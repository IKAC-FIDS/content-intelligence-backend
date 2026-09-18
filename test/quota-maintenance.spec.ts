import { QuotaMetric } from '@prisma/client';
import { QuotaMaintenance } from '../src/quota/quota-maintenance';
describe('QuotaMaintenance fix 000093', () => {
  it('bootstrap dry-run creates only structural disabled rows and no guessed limits', async () => {
    const prisma: any = {
      plan: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'p1', code: 'BUSINESS', quotas: [] }]),
      },
    };
    const result: any = await new QuotaMaintenance(prisma).bootstrap(false);
    expect(result.rowsToCreate).toHaveLength(Object.keys(QuotaMetric).length);
    expect(result.result).toBe('QUOTA_MATRIX_REQUIRES_COMMERCIAL_APPROVAL');
    expect(result.rowsToCreate[0]).not.toHaveProperty('hardLimit');
  });
  it('bootstrap apply is idempotent when every structural row exists', async () => {
    const quotas = Object.values(QuotaMetric).map((metric) => ({ metric }));
    const prisma: any = {
      plan: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'p1', code: 'BUSINESS', quotas }]),
      },
      $transaction: jest.fn(),
    };
    const result = await new QuotaMaintenance(prisma).bootstrap(true);
    expect(result).toMatchObject({ created: 0, unchanged: quotas.length });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('backfill requires an exact existing Organization', async () => {
    const prisma: any = {
      organization: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    await expect(
      new QuotaMaintenance(prisma).backfill('missing', false),
    ).rejects.toThrow('Exact target');
  });
});
