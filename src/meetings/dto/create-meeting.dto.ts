import { MeetingMode } from '@prisma/client';
import { Transform } from 'class-transformer';
import { ArrayUnique, IsArray, IsEnum, IsOptional, IsString, IsUrl, IsUUID, MaxLength } from 'class-validator';
import { IsApiDateString } from '../../common/validators/api-date-string.validator';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;

export class CreateMeetingDto {
  @Transform(trim) @IsUUID() companyId!: string;
  @IsOptional() @Transform(trim) @IsUUID() opportunityId?: string;
  @Transform(trim) @IsString() @MaxLength(200) title!: string;
  @IsOptional() @Transform(trim) @IsUUID() meetingTypeId?: string;
  @IsOptional() @IsString() agenda?: string;
  @IsOptional() @IsString() description?: string;
  @IsEnum(MeetingMode) mode!: MeetingMode;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @Transform(trim) @IsUrl({ require_protocol: true }) meetingUrl?: string;
  @IsApiDateString() startAt!: string;
  @IsApiDateString() endAt!: string;
  @IsOptional() @IsApiDateString() reminderAt?: string;
  @IsOptional() @IsArray() @ArrayUnique() @IsUUID('4', { each: true }) assigneeUserIds?: string[];
  @IsOptional() @IsArray() @ArrayUnique() @IsUUID('4', { each: true }) attendeePersonIds?: string[];
}
