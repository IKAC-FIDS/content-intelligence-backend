import { PartialType } from '@nestjs/mapped-types';
import { CreateLeadSourceDto } from './create-lead-source.dto';

export class UpdateLeadSourceDto extends PartialType(CreateLeadSourceDto) {}
