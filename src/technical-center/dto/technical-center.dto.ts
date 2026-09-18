import { PartialType } from '@nestjs/mapped-types';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  KnowledgeBaseStatus,
  KnowledgeContentType,
  TechnicalConfidentiality,
  TechnicalDocumentStatus,
  TechnicalReleaseStatus,
  TechnicalResourceStatus,
  TechnicalResourceType,
  TechnicalVisibility,
  TenderRequirementStatus,
  TenderBidDecision,
  TenderQualificationDecision,
  TenderReviewStatus,
  TenderReviewType,
  TenderStatus,
  TenderType,
  Priority,
  TaskAssignmentScope,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsArray,
  IsBooleanString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationDto } from '../../common/pagination/pagination.dto';
import { IsApiDateString } from '../../common/validators/api-date-string.validator';

export class TechnicalListDto extends PaginationDto {
  @IsOptional() @IsString() @MaxLength(200) search?: string;
  @IsOptional() @IsUUID() productId?: string;
  @IsOptional() @IsUUID() releaseId?: string;
  @IsOptional() @IsUUID() companyId?: string;
  @IsOptional() @IsUUID() opportunityId?: string;
  @IsOptional() @IsUUID() ownerId?: string;
  @IsOptional() @IsUUID() teamId?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsString() @MaxLength(80) version?: string;
  @IsOptional() @IsString() @MaxLength(120) category?: string;
  @IsOptional() @IsEnum(TechnicalVisibility) visibility?: TechnicalVisibility;
  @IsOptional() @IsUUID() authorId?: string;
  @IsOptional() @IsBooleanString() reviewDue?: string;
  @IsOptional() @IsString() @MaxLength(40) sort?: string;
  @IsOptional() @IsIn(['asc', 'desc']) sortDirection?: 'asc' | 'desc';
  @IsOptional() @IsApiDateString() from?: string;
  @IsOptional() @IsApiDateString() to?: string;
}

export class TechnicalDocumentListDto extends TechnicalListDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID() tenderId?: string;
  @ApiPropertyOptional({ enum: TechnicalConfidentiality })
  @IsOptional() @IsEnum(TechnicalConfidentiality) confidentiality?: TechnicalConfidentiality;
}

export class TransitionDto {
  @IsString() status!: string;
  @IsOptional() @IsString() @MaxLength(1000) reason?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) revision?: number;
}

export class ReleaseTransitionDto extends TransitionDto {
  @IsEnum(TechnicalReleaseStatus) status!: TechnicalReleaseStatus;
}
export class KnowledgeTransitionDto extends TransitionDto {
  @IsEnum(KnowledgeBaseStatus) status!: KnowledgeBaseStatus;
}
export class DocumentTransitionDto extends TransitionDto {
  @IsEnum(TechnicalDocumentStatus) status!: TechnicalDocumentStatus;
}
export class TenderTransitionDto extends TransitionDto {
  @IsEnum(TenderStatus) status!: TenderStatus;
}

export class CreateReleaseDto {
  @IsUUID() productId!: string;
  @IsString() @Length(1, 80) version!: string;
  @IsString() @Length(1, 200) title!: string;
  @IsOptional() @IsString() @MaxLength(1000) summary?: string;
  @IsOptional() @IsString() releaseNotes?: string;
  @IsOptional() @IsApiDateString() releaseDate?: string;
  @IsOptional() @IsApiDateString() supportStartDate?: string;
  @IsOptional() @IsApiDateString() supportEndDate?: string;
  @IsOptional() @IsApiDateString() endOfLifeDate?: string;
}
export class UpdateReleaseDto extends PartialType(CreateReleaseDto) {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) revision?: number;
}

export class CreateKnowledgeDto {
  @IsString() @Length(1, 200) title!: string;
  @IsString() @Length(1, 160) slug!: string;
  @IsOptional() @IsString() @Length(1, 100000) content?: string | null;
  @IsOptional() @IsEnum(KnowledgeContentType) contentType?: KnowledgeContentType;
  @IsOptional() @IsUrl({ require_protocol: true }, { message: 'externalUrl must be a valid URL' }) @MaxLength(2000) externalUrl?: string | null;
  @IsOptional() @IsString() @MaxLength(1000) summary?: string | null;
  @IsOptional() @IsString() @MaxLength(120) category?: string | null;
  @IsOptional() @IsEnum(TechnicalVisibility) visibility?: TechnicalVisibility;
  @IsOptional() @IsUUID() productId?: string | null;
  @IsOptional() @IsUUID() releaseId?: string | null;
  @IsOptional() @IsUUID() ownerId?: string | null;
  @IsOptional() @IsUUID() reviewerId?: string | null;
  @IsOptional() @IsApiDateString() nextReviewAt?: string | null;
}
export class UpdateKnowledgeDto extends PartialType(CreateKnowledgeDto) {}

export class CreateDocumentDto {
  @IsString() @Length(1, 200) title!: string;
  @IsString() @Length(1, 100) documentType!: string;
  @IsUUID() ownerId!: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
  @IsOptional() @IsEnum(TechnicalConfidentiality) confidentiality?: TechnicalConfidentiality;
  @IsOptional() @IsUUID() productId?: string;
  @IsOptional() @IsUUID() releaseId?: string;
  @IsOptional() @IsUUID() companyId?: string;
  @IsOptional() @IsUUID() opportunityId?: string;
  @IsOptional() @IsUUID() tenderId?: string;
  @IsOptional() @IsApiDateString() effectiveFrom?: string;
  @IsOptional() @IsApiDateString() expiresAt?: string;
}
export class UpdateDocumentDto extends PartialType(CreateDocumentDto) {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) revision?: number;
}
export class CreateDocumentVersionDto {
  @IsString() @Length(1, 80) version!: string;
  @IsOptional() @IsUUID() attachmentId?: string;
  @IsOptional() @IsString() @MaxLength(128) contentHash?: string;
}

export class CreateResourceDto {
  @IsString() @Length(1, 200) title!: string;
  @IsEnum(TechnicalResourceType) resourceType!: TechnicalResourceType;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
  @IsOptional() @IsUUID() productId?: string;
  @IsOptional() @IsUUID() releaseId?: string;
  @IsOptional() @IsUrl({ require_protocol: true }) url?: string;
  @IsOptional() @IsString() @MaxLength(80) version?: string;
  @IsOptional() @IsString() @MaxLength(128) checksum?: string;
  @IsOptional() @IsUUID() ownerId?: string;
}
export class UpdateResourceDto extends PartialType(CreateResourceDto) {
  @IsOptional() @IsUUID() attachmentId?: string;
  @IsOptional() @IsEnum(TechnicalResourceStatus) status?: TechnicalResourceStatus;
}

export class CreateTenderDto {
  @IsString() @Length(1, 200) title!: string;
  @IsEnum(TenderType) tenderType!: TenderType;
  @IsUUID() ownerId!: string;
  @IsOptional() @IsString() @MaxLength(100) referenceNumber?: string;
  @IsOptional() @IsUUID() companyId?: string;
  @IsOptional() @IsUUID() opportunityId?: string;
  @IsOptional() @IsUUID() teamId?: string;
  @IsOptional() @IsString() @MaxLength(120) source?: string;
  @IsOptional() @IsString() @MaxLength(10000) description?: string;
  @IsOptional() @IsApiDateString() submissionDeadline?: string;
  @IsOptional() @IsApiDateString() technicalDeadline?: string;
  @IsOptional() @IsApiDateString() expectedDecisionDate?: string;
  @IsOptional() @IsNumberString() estimatedValue?: string;
  @IsOptional() @IsString() @Length(3, 3) currency?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) probability?: number;
  @IsOptional() @IsUUID() technicalLeadId?: string;
  @IsOptional() @IsUUID() commercialLeadId?: string;
}
export class UpdateTenderDto extends PartialType(CreateTenderDto) {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) revision?: number;
}

export class KnowledgeCategoryOptionsDto {
  @IsOptional() @IsString() @MaxLength(120) search?: string;
}

export class UpdateTenderQualificationDto {
  @IsOptional() @IsEnum(TenderBidDecision) bidDecision?: TenderBidDecision;
  @IsOptional() @IsEnum(TenderQualificationDecision) qualificationDecision?: TenderQualificationDecision;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) fitScore?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) riskScore?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) feasibilityScore?: number;
  @IsOptional() @IsString() @MaxLength(10000) fitNotes?: string;
  @IsOptional() @IsString() @MaxLength(10000) riskNotes?: string;
  @IsOptional() @IsString() @MaxLength(10000) feasibilityNotes?: string;
  @IsOptional() @IsString() @MaxLength(20000) qualificationSummary?: string;
  @IsOptional() @IsString() @MaxLength(20000) qualificationConditions?: string;
  @IsOptional() @IsString() @MaxLength(10000) decisionReason?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) revision?: number;
}

export class CreateRequirementDto {
  @IsString() @Length(1, 200) title!: string;
  @IsOptional() @IsString() @MaxLength(120) category?: string;
  @IsOptional() @IsString() @MaxLength(10000) description?: string;
  @IsOptional() @IsString() @MaxLength(120) section?: string;
  @IsOptional() @IsString() @MaxLength(40) page?: string;
  @IsOptional() @IsString() @MaxLength(120) referenceId?: string;
  @IsOptional() @IsString() @MaxLength(10000) notes?: string;
  @IsOptional() @IsUUID() parentRequirementId?: string | null;
  @IsOptional() @IsArray() @IsUUID('4', { each: true }) dependencyIds?: string[];
  @IsOptional() @IsBoolean() mandatory?: boolean;
  @IsOptional() @IsUUID() ownerId?: string | null;
  @IsOptional() @IsApiDateString() dueDate?: string;
  @IsOptional() @IsString() @MaxLength(20000) response?: string;
  @IsOptional() @IsEnum(TenderRequirementStatus) status?: TenderRequirementStatus;
  @IsOptional() @IsString() @MaxLength(2000) blockedReason?: string;
}
export class UpdateRequirementDto extends PartialType(CreateRequirementDto) {}

export class RequirementDependencyDto {
  @IsUUID() dependsOnRequirementId!: string;
}

export class LinkRequirementTaskDto {
  @IsUUID() taskId!: string;
}

export class CreateRequirementTaskDto {
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(10000) description?: string;
  @IsOptional() @IsEnum(Priority) priority?: Priority;
  @IsOptional() @IsApiDateString() dueAt?: string;
  @IsOptional() @IsUUID() assignedToId?: string;
  @IsOptional() @IsEnum(TaskAssignmentScope) assignmentScope?: TaskAssignmentScope;
  @IsOptional() @IsUUID() teamId?: string;
}

export class CreateDeliverableDto {
  @IsUUID() documentId!: string;
  @IsOptional() @IsString() @MaxLength(200) label?: string;
  @IsOptional() @IsBoolean() required?: boolean;
}

export class RequestTenderReviewDto {
  @IsEnum(TenderReviewType) type!: TenderReviewType;
  @IsOptional() @IsUUID() reviewerId?: string;
  @IsOptional() @IsString() @MaxLength(2000) comment?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) revision?: number;
}

export class DecideTenderReviewDto {
  @IsEnum(TenderReviewStatus) status!: TenderReviewStatus;
  @IsOptional() @IsString() @MaxLength(2000) comment?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) revision?: number;
}

export const lifecycleEnums = {
  release: TechnicalReleaseStatus,
  knowledge: KnowledgeBaseStatus,
  document: TechnicalDocumentStatus,
  tender: TenderStatus,
};
