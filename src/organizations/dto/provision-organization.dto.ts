import { IsString, IsUUID, Matches, MaxLength } from 'class-validator';

export class ProvisionOrganizationDto {
  @IsUUID()
  ownerUserId!: string;

  @IsString()
  @MaxLength(80)
  @Matches(/^[a-z0-9][a-z0-9-_]*$/)
  defaultTeamCode: string = 'default';

  @IsString()
  @MaxLength(200)
  defaultTeamName: string = 'Default Team';
}
