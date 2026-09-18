import { IsOptional, IsString } from 'class-validator';

export class ArchiveOpportunityDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
