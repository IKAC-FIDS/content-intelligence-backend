import { PartialType } from '@nestjs/mapped-types';
import { CreateOpportunityLineItemDto } from './create-opportunity-line-item.dto';

export class UpdateOpportunityLineItemDto extends PartialType(
  CreateOpportunityLineItemDto,
) {}