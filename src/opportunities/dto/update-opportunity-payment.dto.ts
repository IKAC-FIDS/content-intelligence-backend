import { PartialType } from '@nestjs/mapped-types';
import { CreateOpportunityPaymentDto } from './create-opportunity-payment.dto';

export class UpdateOpportunityPaymentDto extends PartialType(
  CreateOpportunityPaymentDto,
) {}