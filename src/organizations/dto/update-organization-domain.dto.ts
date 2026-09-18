import { OrganizationDomainStatus } from "@prisma/client";
import { IsEnum } from "class-validator";

export class UpdateOrganizationDomainDto {
  @IsEnum(OrganizationDomainStatus) status!: OrganizationDomainStatus;
}
