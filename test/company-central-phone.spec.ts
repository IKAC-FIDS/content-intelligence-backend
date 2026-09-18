import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CompaniesService } from '../src/companies/companies.service';
import { normalizeCompanyPhone } from '../src/companies/company-phone.util';
import { CreateCompanyDto } from '../src/companies/dto/create-company.dto';
import { UpdateCompanyDto } from '../src/companies/dto/update-company.dto';
import { tenantUser } from './helpers/tenant-user';
import { quotaMock } from './helpers/quota';

const organizationId = '00000000-0000-4000-8000-000000000001';
const companyId = '00000000-0000-4000-8000-000000000010';
const user = tenantUser({
  userId: 'user-1',
  email: 'user@example.com',
  role: 'ADMIN' as const,
  organizationId,
});

function setup() {
  const current = {
    id: companyId,
    organizationId,
    legalName: 'شرکت نمونه',
    centralPhone: '02111111111',
  };
  const tx = {
    company: {
      create: jest.fn().mockResolvedValue({ ...current, centralPhone: null }),
      update: jest.fn().mockResolvedValue(current),
      findUniqueOrThrow: jest.fn().mockImplementation(async () => current),
    },
    companyHierarchyRelation: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const prisma = {
    company: {
      findFirst: jest.fn().mockResolvedValue(current),
      findMany: jest.fn().mockResolvedValue([current]),
      count: jest.fn().mockResolvedValue(1),
    },
    industry: { findUnique: jest.fn(), findFirst: jest.fn() },
    leadSource: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn(),
    },
    personContact: {
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) =>
      callback(tx),
    ),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const companyAccess = {
    assertCompanyMutable: jest.fn().mockResolvedValue(current),
  };

  return {
    tx,
    prisma,
    audit,
    service: new CompaniesService(
      prisma as any,
      audit as any,
      companyAccess as any,
      quotaMock() as any,
    ),
  };
}

describe('company central phone normalization', () => {
  it.each([
    ['۰۲۱-۵۷۹۸۵۰۰۰', '02157985000'],
    ['٠٢١-٥٧٩٨٥٠٠٠', '02157985000'],
    ['(021) 57985000', '02157985000'],
    ['+98 21 57985000', '+982157985000'],
  ])('normalizes %s without parsing it as a number', (input, expected) => {
    expect(normalizeCompanyPhone(input)).toBe(expected);
  });

  it('preserves leading zero and an optional leading plus sign', () => {
    expect(normalizeCompanyPhone(' 021 57985000 ')).toBe('02157985000');
    expect(normalizeCompanyPhone(' +98 (21) 57985000 ')).toBe('+982157985000');
  });

  it('rejects an alphabetic phone through the create contract', async () => {
    const dto = plainToInstance(CreateCompanyDto, {
      legalName: 'شرکت نمونه',
      centralPhone: '021-CALL-US',
    });
    const errors = await validate(dto);
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'centralPhone' }),
      ]),
    );
  });

  it('normalizes create and update DTO values and keeps explicit null', async () => {
    const createDto = plainToInstance(CreateCompanyDto, {
      legalName: 'شرکت نمونه',
      centralPhone: '۰۲۱-۵۷۹۸۵۰۰۰',
    });
    const updateDto = plainToInstance(UpdateCompanyDto, {
      centralPhone: '(021) 57985000',
    });
    const clearDto = plainToInstance(UpdateCompanyDto, {
      centralPhone: null,
    });
    expect(await validate(createDto)).toHaveLength(0);
    expect(await validate(updateDto)).toHaveLength(0);
    expect(await validate(clearDto)).toHaveLength(0);
    expect(createDto.centralPhone).toBe('02157985000');
    expect(updateDto.centralPhone).toBe('02157985000');
    expect(clearDto.centralPhone).toBeNull();
  });
});

describe('CompaniesService central phone persistence', () => {
  it('creates a company with a normalized central phone', async () => {
    const { service, tx } = setup();
    await service.create(
      { legalName: 'شرکت نمونه', centralPhone: '(021) 57985000' },
      user,
    );
    expect(tx.company.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId,
        centralPhone: '02157985000',
      }),
    });
  });

  it('leaves an omitted create phone unset so PostgreSQL stores null', async () => {
    const { service, tx } = setup();
    await service.create({ legalName: 'شرکت نمونه' }, user);
    expect(
      tx.company.create.mock.calls[0][0].data.centralPhone,
    ).toBeUndefined();
  });

  it('changes, retains, and clears centralPhone according to update presence', async () => {
    const { service, tx } = setup();

    await service.update(companyId, { centralPhone: '+98 21 57985000' }, user);
    expect(tx.company.update.mock.calls[0][0].data.centralPhone).toBe(
      '+982157985000',
    );

    tx.company.update.mockClear();
    await service.update(companyId, { legalName: 'نام جدید' }, user);
    expect(
      tx.company.update.mock.calls[0][0].data.centralPhone,
    ).toBeUndefined();

    tx.company.update.mockClear();
    await service.update(companyId, { centralPhone: null }, user);
    expect(tx.company.update.mock.calls[0][0].data.centralPhone).toBeNull();
  });

  it('does not query for uniqueness and allows duplicate switchboard numbers', async () => {
    const { service, tx, prisma } = setup();
    await service.create(
      { legalName: 'شرکت اول', centralPhone: '02157985000' },
      user,
    );
    await service.create(
      { legalName: 'شرکت دوم', centralPhone: '02157985000' },
      user,
    );
    expect(tx.company.create).toHaveBeenCalledTimes(2);
    expect(prisma.company.findFirst).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { centralPhone: '02157985000' } }),
    );
  });

  it('does not modify person contacts while creating or updating company phone', async () => {
    const { service, prisma } = setup();
    await service.create(
      { legalName: 'شرکت نمونه', centralPhone: '02157985000' },
      user,
    );
    await service.update(companyId, { centralPhone: null }, user);
    expect(prisma.personContact.create).not.toHaveBeenCalled();
    expect(prisma.personContact.update).not.toHaveBeenCalled();
    expect(prisma.personContact.delete).not.toHaveBeenCalled();
  });
});

describe('CompaniesService central phone search', () => {
  it.each([
    ['02157985000', '02157985000'],
    ['(۰۲۱) ۵۷۹۸۵۰۰۰', '02157985000'],
  ])('searches %s using normalized phone %s', async (search, normalized) => {
    const { service, prisma } = setup();
    await service.findAll(user, {}, { search });
    const where = prisma.company.findMany.mock.calls[0][0].where;
    expect(where.organizationId).toBe(organizationId);
    expect(where.OR).toContainEqual({
      centralPhone: { contains: normalized },
    });
  });

  it('does not add a match-all phone condition for non-phone search', async () => {
    const { service, prisma } = setup();
    await service.findAll(user, {}, { search: 'شرکت نمونه' });
    const where = prisma.company.findMany.mock.calls[0][0].where;
    expect(where.OR).not.toContainEqual({ centralPhone: { contains: '' } });
    expect(where.organizationId).toBe(organizationId);
  });

  it('returns centralPhone from full company list and detail records', async () => {
    const { service } = setup();
    const list = await service.findAll(user, {});
    const detail = await service.findOne(companyId, user);
    expect(list.data[0].centralPhone).toBe('02111111111');
    expect(detail.centralPhone).toBe('02111111111');
  });
});
