import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PersonContactsService } from '../src/person-contacts/person-contacts.service';
import { CreatePersonContactDto } from '../src/people/dto/person-contact.dto';
import { LookupsService } from '../src/lookups/lookups.service';
import { tenantUser } from './helpers/tenant-user';

const organizationId = '00000000-0000-4000-8000-000000000001';
const personId = '00000000-0000-4000-8000-000000000010';
const contactId = '00000000-0000-4000-8000-000000000020';
const typeOptionId = '00000000-0000-4000-8000-000000000030';
const user = tenantUser({
  userId: 'user-1',
  email: 'user@example.com',
  role: 'ADMIN' as const,
  organizationId,
});

function setup() {
  const contact = {
    id: contactId,
    personId,
    typeOptionId,
    type: 'WORK',
    value: '02111111111',
    isPrimary: false,
    note: null,
    person: { id: personId },
    typeOption: {
      id: typeOptionId,
      group: 'contact_types',
      code: 'WORK',
      label: 'تلفن کاری',
      isActive: true,
    },
  };
  const prisma = {
    person: { findFirst: jest.fn().mockResolvedValue({ id: personId }) },
    lookupOption: {
      findUnique: jest.fn().mockResolvedValue(contact.typeOption),
    },
    personContact: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(contact),
      findMany: jest.fn().mockResolvedValue([contact]),
      create: jest.fn().mockImplementation(async ({ data }) => ({ ...contact, ...data })),
      update: jest.fn().mockImplementation(async ({ data }) => ({ ...contact, ...data })),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };

  return { prisma, service: new PersonContactsService(prisma as any) };
}

describe('person contact type option contract', () => {
  it('requires typeOptionId and does not accept legacy type as a create substitute', async () => {
    const dto = plainToInstance(CreatePersonContactDto, {
      type: 'WORK',
      value: '02111111111',
    });
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'typeOptionId' }),
        expect.objectContaining({ property: 'type' }),
      ]),
    );
  });

  it('resolves a valid active contact_types option and stores its code snapshot', async () => {
    const { prisma, service } = setup();

    await service.create(personId, { typeOptionId, value: ' 02111111111 ' }, user);

    expect(prisma.lookupOption.findUnique).toHaveBeenCalledWith({
      where: { id: typeOptionId },
    });
    expect(prisma.personContact.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ typeOptionId, type: 'WORK', value: '02111111111' }),
        include: { typeOption: true },
      }),
    );
  });

  it.each([
    ['wrong group', { group: 'social_types', isActive: true }],
    ['inactive option', { group: 'contact_types', isActive: false }],
    ['missing option', null],
  ])('rejects an id that resolves to a %s', async (_case, optionOverride) => {
      const { prisma, service } = setup();
      prisma.lookupOption.findUnique.mockResolvedValue(
        optionOverride
          ? {
              id: typeOptionId,
              code: 'WORK',
              label: 'تلفن کاری',
              ...optionOverride,
            }
          : null,
      );

      await expect(
        service.create(personId, { typeOptionId, value: '02111111111' }, user),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.personContact.create).not.toHaveBeenCalled();
  });

  it('preserves the current type relation and snapshot when update omits typeOptionId', async () => {
    const { prisma, service } = setup();

    await service.update(contactId, { note: 'یادداشت جدید' }, user);

    expect(prisma.lookupOption.findUnique).not.toHaveBeenCalled();
    expect(prisma.personContact.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { note: 'یادداشت جدید' } }),
    );
  });

  it('refreshes both the relation and code snapshot when update changes typeOptionId', async () => {
    const { prisma, service } = setup();
    const newTypeOptionId = '00000000-0000-4000-8000-000000000031';
    prisma.lookupOption.findUnique.mockResolvedValue({
      id: newTypeOptionId,
      group: 'contact_types',
      code: 'MOBILE',
      label: 'موبایل',
      isActive: true,
    });

    await service.update(contactId, { typeOptionId: newTypeOptionId }, user);

    expect(prisma.personContact.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { typeOptionId: newTypeOptionId, type: 'MOBILE' },
      }),
    );
  });

  it('keeps legacy rows with a null relation readable', async () => {
    const { prisma, service } = setup();
    const legacy = {
      id: contactId,
      personId,
      typeOptionId: null,
      typeOption: null,
      type: 'FAX_LEGACY',
      value: '02122222222',
    };
    prisma.personContact.findMany.mockResolvedValue([legacy]);

    await expect(service.findByPerson(personId, user)).resolves.toEqual([legacy]);
    expect(prisma.personContact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ include: { typeOption: true } }),
    );
  });
});

describe('contact type lookup route', () => {
  it('maps the public contact-types route to the contact_types storage group', async () => {
    const prisma = {
      lookupOption: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new LookupsService(prisma as any);

    await service.findAll('contact-types');

    expect(prisma.lookupOption.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { group: 'contact_types', isActive: true },
      }),
    );
  });
});
