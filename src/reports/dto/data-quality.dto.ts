import { Transform, Type } from "class-transformer";
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";
import { ReportFiltersDto } from "./report-filters.dto";
const csv = ({ value }: { value: unknown }) =>
  value == null || value === ""
    ? undefined
    : (Array.isArray(value) ? value : String(value).split(","))
        .map(String)
        .map((v) => v.trim())
        .filter(Boolean);
export enum DataQualitySeverity {
  CRITICAL = "CRITICAL",
  HIGH = "HIGH",
  MEDIUM = "MEDIUM",
  LOW = "LOW",
}
export enum ReportingScope {
  ORGANIZATION = "ORGANIZATION",
  GLOBAL_CATALOG = "GLOBAL_CATALOG",
}
export class DataQualityQueryDto extends ReportFiltersDto {
  @Transform(csv)
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  entityTypes?: string[];
  @Transform(csv)
  @IsOptional()
  @IsArray()
  @IsEnum(DataQualitySeverity, { each: true })
  severities?: DataQualitySeverity[];
  @Transform(csv)
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  ruleKeys?: string[];
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
}
export class DataQualityIssuesQueryDto extends ReportFiltersDto {
  @IsString() ruleKey!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
}
