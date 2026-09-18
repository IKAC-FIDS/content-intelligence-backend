import { PartialType } from '@nestjs/mapped-types';
import { CreateUseCaseDto } from './create-use-case.dto';

export class UpdateUseCaseDto extends PartialType(CreateUseCaseDto) {}