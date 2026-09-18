import { IsDefined, IsUUID, ValidateIf } from 'class-validator';

export class ChangeOpportunityOwnerDto {
  @IsDefined()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  ownerId!: string | null;
}
