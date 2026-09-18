import { PartialType } from '@nestjs/mapped-types';
import { CreatePainPointDto } from './create-pain-point.dto';

export class UpdatePainPointDto extends PartialType(CreatePainPointDto) {}