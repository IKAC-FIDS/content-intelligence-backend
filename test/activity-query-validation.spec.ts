import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ActivitiesController } from '../src/activities/activities.controller';
import { FindActivitiesDto } from '../src/activities/dto/find-activities.dto';

const companyId = '00000000-0000-4000-8000-000000000010';
const personId = '00000000-0000-4000-8000-000000000011';
const ownerId = '00000000-0000-4000-8000-000000000012';
const createdById = '00000000-0000-4000-8000-000000000013';
const user = {
  userId: createdById,
  email: 'user@example.com',
  role: 'ADMIN' as const,
  organizationId: '00000000-0000-4000-8000-000000000001',
};

const validationPipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  forbidNonWhitelisted: true,
});

async function validateQuery(query: Record<string, unknown>) {
  return validationPipe.transform(query, {
    type: 'query',
    metatype: FindActivitiesDto,
  }) as Promise<FindActivitiesDto>;
}

describe('GET /api/activities query validation', () => {
  it('accepts pagination without requiring companyId and applies defaults', async () => {
    const dto = await validateQuery({ page: '1', limit: '20' });
    expect(dto).toEqual(
      expect.objectContaining({
        page: 1,
        limit: 20,
        sortBy: 'activityDate',
        sortOrder: 'desc',
      }),
    );
    expect(dto.companyId).toBeUndefined();
  });

  it('accepts Activity Center default sorting through the controller path', async () => {
    const dto = await validateQuery({
      page: '1',
      limit: '20',
      sortBy: 'activityDate',
      sortOrder: 'desc',
    });
    const service = { findAll: jest.fn().mockResolvedValue({ data: [], meta: {} }) };
    const controller = new ActivitiesController(service as any);
    await controller.findAll(dto, user);
    expect(service.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ sortBy: 'activityDate', sortOrder: 'desc' }),
      user,
    );
  });

  it('accepts createdAt ascending sorting', async () => {
    await expect(
      validateQuery({ sortBy: 'createdAt', sortOrder: 'asc' }),
    ).resolves.toEqual(
      expect.objectContaining({ sortBy: 'createdAt', sortOrder: 'asc' }),
    );
  });

  it.each([
    [{ sortBy: 'occurredAt' }, 'sortBy'],
    [{ sortOrder: 'sideways' }, 'sortOrder'],
  ])('rejects unsupported sorting input %j', async (query, property) => {
    await expect(validateQuery(query)).rejects.toMatchObject({
      response: expect.objectContaining({
        message: expect.arrayContaining([expect.stringContaining(property)]),
      }),
    });
  });

  it.each(['companyId', 'personId', 'ownerId', 'createdById'])(
    'normalizes an empty %s to undefined before UUID validation',
    async (property) => {
      const dto = await validateQuery({ [property]: '' });
      expect(dto[property as keyof FindActivitiesDto]).toBeUndefined();
    },
  );

  it('accepts valid optional UUID filters', async () => {
    const dto = await validateQuery({
      companyId,
      personId,
      ownerId,
      createdById,
    });
    expect(dto).toEqual(
      expect.objectContaining({ companyId, personId, ownerId, createdById }),
    );
  });

  it.each(['companyId', 'personId', 'ownerId', 'createdById'])(
    'rejects an invalid non-empty %s',
    async (property) => {
      await expect(validateQuery({ [property]: 'invalid-value' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    },
  );

  it('rejects unknown query properties under the global whitelist policy', async () => {
    await expect(validateQuery({ arbitraryPrismaField: 'desc' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('retains pagination bounds from PaginationDto', async () => {
    const invalid = plainToInstance(FindActivitiesDto, { page: '0', limit: '101' });
    const errors = await validate(invalid);
    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['page', 'limit']),
    );
  });
});
