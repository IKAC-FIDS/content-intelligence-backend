import { IsUUID, IsArray, IsNotEmpty, ArrayMinSize } from 'class-validator';

export class ChangeOwnerDto {
  @IsUUID()
  @IsNotEmpty()
  newOwnerId!: string;
}

export class BulkChangeOwnerDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  companyIds!: string[];

  @IsUUID()
  @IsNotEmpty()
  newOwnerId!: string;
}