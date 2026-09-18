import { PartialType } from '@nestjs/mapped-types';
import { CreateCompanyBranchDto } from './create-company-branch.dto';

export class UpdateCompanyBranchDto extends PartialType(CreateCompanyBranchDto) {}