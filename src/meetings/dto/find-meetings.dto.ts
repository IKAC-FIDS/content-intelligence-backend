import { MeetingMode, MeetingStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { IsApiDateString } from '../../common/validators/api-date-string.validator';

const bool = ({ value }: { value: unknown }) => value === true || value === 'true';
export class FindMeetingsDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsUUID() companyId?: string;
  @IsOptional() @IsUUID() opportunityId?: string;
  @IsOptional() @IsUUID() organizerId?: string;
  @IsOptional() @IsUUID() assignedUserId?: string;
  @IsOptional() @IsUUID() attendeePersonId?: string;
  @IsOptional() @IsEnum(MeetingStatus) status?: MeetingStatus;
  @IsOptional() @IsEnum(MeetingMode) mode?: MeetingMode;
  @IsOptional() @IsUUID() meetingTypeId?: string;
  @IsOptional() @IsApiDateString() dateFrom?: string;
  @IsOptional() @IsApiDateString() dateTo?: string;
  @IsOptional() @Transform(bool) @IsBoolean() upcoming?: boolean;
  @IsOptional() @Transform(bool) @IsBoolean() past?: boolean;
  @IsOptional() @Transform(bool) @IsBoolean() mine?: boolean;
  @IsOptional() @Transform(bool) @IsBoolean() reminderDue?: boolean;
}
