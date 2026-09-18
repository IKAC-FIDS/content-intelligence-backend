import { IsOptional, IsString, IsArray, ValidateNested, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';
import { DiscoveryQuestionDto } from './discovery-question.dto';
import { ObjectionDto } from './objection.dto';

export class UpsertCallCardDto {
  @IsOptional()
  @IsUUID()
  primaryContactId?: string;

  @IsOptional()
  @IsUUID()
  secondaryContactId?: string;

  @IsOptional()
  @IsString()
  entryAngle?: string;

  @IsOptional()
  @IsString()
  painPoint?: string;

  @IsOptional()
  @IsString()
  useCase?: string;

  @IsOptional()
  @IsString()
  openingLine?: string;

  @IsOptional()
  @IsString()
  firstEmail?: string;

  @IsOptional()
  @IsString()
  linkedinMsg?: string;

  // ✅ اعتبارسنجی برای discoveryQs (آرایه‌ای از سوالات)
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DiscoveryQuestionDto)
  discoveryQs?: DiscoveryQuestionDto[];

  // ✅ اعتبارسنجی برای objections (آرایه‌ای از آبجکت‌های objection/response)
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ObjectionDto)
  objections?: ObjectionDto[];

  @IsOptional()
  @IsString()
  meetingAsk?: string;

  @IsOptional()
  @IsString()
  callGoal?: string;

  @IsOptional()
  @IsString()
  qualificationCriteria?: string;

  @IsOptional()
  @IsString()
  disqualificationCriteria?: string;

  @IsOptional()
  @IsString()
  followUpNoResponseAt?: string;

  @IsOptional()
  @IsString()
  followUpInterestAt?: string;
}