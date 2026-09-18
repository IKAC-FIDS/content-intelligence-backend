import { BadRequestException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CompaniesService } from '../src/companies/companies.service';
import { FindCompanyOptionsDto } from '../src/companies/dto/find-company-options.dto';
import { tenantUser } from './helpers/tenant-user';
import { quotaMock } from './helpers/quota';

const organizationId = '00000000-0000-4000-8000-000000000001';
const otherOrganizationId = '00000000-0000-4000-8000-000000000002';
const companyId = '00000000-0000-4000-8000-000000000010';
const parentId = '00000000-0000-4000-8000-000000000011';
const descendantId = '00000000-0000-4000-8000-000000000012';
const user = tenantUser({
  userId: companyId,
  email: 'user@example.com',
  role: 'ADMIN' as const,
  organizationId,
});

const option = {
  id: companyId,
  legalName: 'شرکت ملت',
  brandName: 'ملت',
  nationalId: '10101010101',
  registrationNumber: '12345',
  economicCode: '411111111111',
  parentCompanyId: null,
};

function createService(overrides: Record<string, unknown> = {}) {
  const prisma = {
    company: {
      findMany: jest.fn().mockResolvedValue([option]),
      count: jest.fn().mockResolvedValue(26),
      findFirst: jest.fn().mockResolvedValue(option),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ organizationId }),
    },
    companyHierarchyRelation: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    ...overrides,
  };
  return {
    service: new CompaniesService(
      prisma as any,
      {} as any,
      {} as any,
      quotaMock() as any,
    ),
    prisma,
  };
}

describe('CompaniesService company options', () => {
  it('returns the initial lightweight page with the 25-item default', async () => {
    const { service, prisma } = createService();
    const result = await service.findOptions(user, {});
    expect(result.data).toEqual([option]);
    expect(result.meta).toEqual({
      total: 26,
      page: 1,
      limit: 25,
      totalPages: 2,
      hasNext: true,
      hasPrevious: false,
    });
    expect(prisma.company.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 25,
        skip: 0,
        select: expect.any(Object),
      }),
    );
    expect(prisma.company.findMany.mock.calls[0][0].include).toBeUndefined();
  });

  it('supports page sizes greater than ten and produces correct later-page metadata', async () => {
    const { service, prisma } = createService();
    prisma.company.count.mockResolvedValue(60);
    const result = await service.findOptions(user, { page: 2, limit: 30 });
    expect(prisma.company.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 30, skip: 30 }),
    );
    expect(result.meta).toEqual({
      total: 60,
      page: 2,
      limit: 30,
      totalPages: 2,
      hasNext: false,
      hasPrevious: true,
    });
  });

  it.each([
    'legalName',
    'brandName',
    'nationalId',
    'registrationNumber',
    'economicCode',
  ])('searches %s in the database rather than a loaded page', async (field) => {
    const { service, prisma } = createService();
    await service.findOptions(user, { search: ' ملت ' });
    const where = prisma.company.findMany.mock.calls[0][0].where;
    expect(where.OR).toContainEqual({
      [field]: { contains: 'ملت', mode: 'insensitive' },
    });
  });

  it('enforces organization, archive, and exclusion filters without owner scope', async () => {
    const { service, prisma } = createService();
    await service.findOptions(user, { excludeId: companyId });
    const where = prisma.company.findMany.mock.calls[0][0].where;
    expect(where).toEqual({
      organizationId,
      archivedAt: null,
      id: { not: companyId },
    });
    expect(where.ownerId).toBeUndefined();
  });

  it('allows archived options only when explicitly requested', async () => {
    const { service, prisma } = createService();
    await service.findOptions(user, { includeArchived: true });
    expect(
      prisma.company.findMany.mock.calls[0][0].where.archivedAt,
    ).toBeUndefined();
  });

  it('hydrates selectedId independently of search pagination', async () => {
    const { service, prisma } = createService();
    await service.findOptions(user, {
      selectedId: companyId,
      search: 'unrelated',
    });
    expect(prisma.company.findMany.mock.calls[0][0].where).toEqual({
      organizationId,
      archivedAt: null,
      id: companyId,
    });
  });

  it('hydrates an option by id inside the organization and hides another organization', async () => {
    const { service, prisma } = createService();
    await expect(service.findOption(companyId, user)).resolves.toEqual(option);
    expect(prisma.company.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: companyId, organizationId } }),
    );
    prisma.company.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.findOption(companyId, {
        ...user,
        organizationId: otherOrganizationId,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a limit above the maximum at DTO validation', async () => {
    const dto = plainToInstance(FindCompanyOptionsDto, { limit: '51' });
    expect(await validate(dto)).toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'limit' })]),
    );
  });
});

describe('CompaniesService hierarchy validation', () => {
  it('rejects self-parenting', async () => {
    const { service, prisma } = createService();
    await expect(
      (service as any).replaceHierarchy(prisma, companyId, [companyId], []),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects assigning a company below one of its descendants', async () => {
    const { service, prisma } = createService();
    prisma.companyHierarchyRelation.findMany.mockResolvedValue([
      { parentCompanyId: companyId, subsidiaryCompanyId: descendantId },
      { parentCompanyId: descendantId, subsidiaryCompanyId: parentId },
    ]);
    await expect(
      (service as any).replaceHierarchy(
        prisma,
        companyId,
        [parentId],
        [descendantId],
      ),
    ).rejects.toThrow('Company hierarchy cannot contain a cycle');
  });

  it('rejects related companies from another organization', async () => {
    const { service, prisma } = createService();
    prisma.company.findMany.mockResolvedValue([]);
    await expect(
      (service as any).validateRelatedCompanies([parentId], organizationId),
    ).rejects.toThrow(
      'All related companies must exist in the current organization',
    );
  });

  it('rejects an archived parent', async () => {
    const { service, prisma } = createService();
    prisma.company.findMany.mockResolvedValue([
      { id: parentId, archivedAt: new Date() },
    ]);
    await expect(
      (service as any).validateRelatedCompanies([parentId], organizationId),
    ).rejects.toThrow('Archived companies cannot be used in company hierarchy');
  });
});
