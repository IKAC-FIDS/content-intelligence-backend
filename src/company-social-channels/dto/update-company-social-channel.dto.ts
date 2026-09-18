import { PartialType } from '@nestjs/mapped-types';
import { CreateCompanySocialChannelDto } from './create-company-social-channel.dto';

export class UpdateCompanySocialChannelDto extends PartialType(CreateCompanySocialChannelDto) {}