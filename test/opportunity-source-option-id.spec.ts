import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateOpportunityDto } from '../src/opportunities/dto/create-opportunity.dto';
import { FindOpportunitiesDto } from '../src/opportunities/dto/find-opportunities.dto';
import { UpdateOpportunityDto } from '../src/opportunities/dto/update-opportunity.dto';

const legacyLookupId = 'lookup_41a2733555889577ec652d4d90d5bc02';

describe('opportunity source lookup identity contract', () => {
  it('accepts the existing lookup identity when creating an opportunity', async () => {
    const dto = plainToInstance(CreateOpportunityDto, {
      companyId: '00000000-0000-4000-8000-000000000001',
      title: 'فرصت نمونه',
      sourceOptionId: legacyLookupId,
    });

    expect(await validate(dto)).toHaveLength(0);
  });

  it('accepts the existing lookup identity when updating an opportunity', async () => {
    const dto = plainToInstance(UpdateOpportunityDto, {
      sourceOptionId: legacyLookupId,
    });

    expect(await validate(dto)).toHaveLength(0);
  });

  it('accepts the existing lookup identity as a list filter', async () => {
    const dto = plainToInstance(FindOpportunitiesDto, {
      sourceOptionId: legacyLookupId,
    });

    expect(await validate(dto)).toHaveLength(0);
  });
});
