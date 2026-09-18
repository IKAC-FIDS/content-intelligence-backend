import { IsEnum, IsOptional } from "class-validator";
import { IsApiDateString } from "../../common/validators/api-date-string.validator";
import { ReportFiltersDto } from "./report-filters.dto";
export enum ComparisonMode {
  PREVIOUS_PERIOD = "PREVIOUS_PERIOD",
  PREVIOUS_YEAR = "PREVIOUS_YEAR",
  CUSTOM = "CUSTOM",
}
export class PeriodComparisonDto extends ReportFiltersDto {
  @IsOptional() @IsEnum(ComparisonMode) comparisonMode?: ComparisonMode =
    ComparisonMode.PREVIOUS_PERIOD;
  @IsOptional() @IsApiDateString() compareStartDate?: string;
  @IsOptional() @IsApiDateString() compareEndDate?: string;
}
