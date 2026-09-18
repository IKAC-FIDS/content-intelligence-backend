import { OmitType } from '@nestjs/mapped-types';
import { CreateOpportunityDto } from './create-opportunity.dto';

export class CreateCompanyOpportunityDto extends OmitType(CreateOpportunityDto, ['companyId'] as const) {}
