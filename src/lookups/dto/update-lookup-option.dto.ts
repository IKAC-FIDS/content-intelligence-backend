import { PartialType } from '@nestjs/mapped-types';
import { CreateLookupOptionDto } from './create-lookup-option.dto';

export class UpdateLookupOptionDto extends PartialType(CreateLookupOptionDto) {}
