import { Transform, Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
} from "class-validator";
import { PaginationDto } from "../../common/dto/pagination.dto";
import { IsApiDateString } from "../../common/validators/api-date-string.validator";
import { AuditResult, AuditSource } from "@prisma/client";

const csv = ({ value }: { value: unknown }) =>
  value == null || value === ""
    ? undefined
    : (Array.isArray(value) ? value : String(value).split(","))
        .map(String)
        .map((v) => v.trim())
        .filter(Boolean);
export class FindAuditLogsDto extends PaginationDto {
  @IsOptional() @IsUUID() actorId?: string;
  @IsOptional() @IsUUID() actorMembershipId?: string;
  @IsOptional() @IsUUID() organizationId?: string;
  @Transform(csv)
  @IsOptional()
  @IsArray()
  @IsUUID("4", { each: true })
  actorIds?: string[];
  @IsOptional() @IsString() entityType?: string;
  @Transform(csv)
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  entityTypes?: string[];
  @IsOptional() @IsString() entityId?: string;
  @IsOptional() @IsString() action?: string;
  @IsOptional() @Type(() => Boolean) @IsBoolean() actionPrefix?: boolean;
  @IsOptional() @IsEnum(AuditSource) source?: AuditSource;
  @IsOptional() @IsEnum(AuditResult) result?: AuditResult;
  @Transform(csv)
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  actions?: string[];
  @IsOptional() @IsString() requestId?: string;
  @IsOptional() @IsString() ipAddress?: string;
  @IsOptional() @IsString() requestMethod?: string;
  @Transform(csv)
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requestMethods?: string[];
  @IsOptional() @IsString() requestPath?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsApiDateString() startDate?: string;
  @IsOptional() @IsApiDateString() endDate?: string;
  @IsOptional() @Type(() => Boolean) @IsBoolean() compact?: boolean;
  @IsOptional() @Type(() => Boolean) @IsBoolean() includePayload?: boolean;
  @IsOptional() @IsIn(["csv", "json", "xlsx"]) format?: "csv" | "json" | "xlsx";
  @IsOptional() @IsIn(["createdAt", "durationMs"]) sortBy?: "createdAt" | "durationMs";
  @IsOptional() @IsIn(["asc", "desc"]) sortOrder?: "asc" | "desc";
}
