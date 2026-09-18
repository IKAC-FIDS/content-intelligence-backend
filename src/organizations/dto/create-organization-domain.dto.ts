import { OrganizationDomainType } from "@prisma/client";
import { IsEnum, IsString, MaxLength } from "class-validator";

export class CreateOrganizationDomainDto {
  @IsEnum(OrganizationDomainType) type!: OrganizationDomainType;
  @IsString() @MaxLength(253) hostname!: string;
}
