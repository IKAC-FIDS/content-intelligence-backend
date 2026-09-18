import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateCompanyDto } from '../src/companies/dto/create-company.dto';
import { UpdateCompanyDto } from '../src/companies/dto/update-company.dto';

describe('company head-office address contract', () => {
  it('accepts the address for create and update requests', async () => {
    const createDto = plainToInstance(CreateCompanyDto, {
      legalName: 'شرکت نمونه',
      headOfficeAddress: 'تهران، خیابان نمونه، پلاک ۱۲',
    });
    const updateDto = plainToInstance(UpdateCompanyDto, {
      headOfficeAddress: 'اصفهان، خیابان نمونه',
    });

    expect(await validate(createDto)).toHaveLength(0);
    expect(await validate(updateDto)).toHaveLength(0);
  });

  it('accepts null for clearing the address and rejects oversized values', async () => {
    const clearDto = plainToInstance(UpdateCompanyDto, {
      headOfficeAddress: null,
    });
    const invalidDto = plainToInstance(CreateCompanyDto, {
      legalName: 'شرکت نمونه',
      headOfficeAddress: 'آ'.repeat(1001),
    });

    expect(await validate(clearDto)).toHaveLength(0);
    expect(await validate(invalidDto)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'headOfficeAddress' }),
      ]),
    );
  });
});
