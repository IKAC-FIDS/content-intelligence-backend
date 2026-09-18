import {
  ArtifactProvider,
  ArtifactRelationType,
  ArtifactType,
  FileAttachmentEntityType,
} from '@prisma/client';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { UploadAttachmentDto } from '../../attachments/dto/upload-attachment.dto';

export class UploadArtifactDto extends UploadAttachmentDto {
  @IsOptional() @IsString() @MaxLength(100) category?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsString() @MaxLength(100) versionLabel?: string;
  @IsOptional() @IsString() @MaxLength(100) confidentiality?: string;
}

export class CreateExternalArtifactDto {
  @IsString() @MaxLength(240) name!: string;
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true }) externalUrl!: string;
  @IsEnum(ArtifactProvider) provider!: ArtifactProvider;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsEnum(FileAttachmentEntityType) entityType!: FileAttachmentEntityType;
  @IsUUID() entityId!: string;
  @IsOptional() @IsEnum(ArtifactRelationType) relationType?: ArtifactRelationType;
  @IsOptional() @IsString() @MaxLength(100) category?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsString() @MaxLength(100) versionLabel?: string;
  @IsOptional() @IsString() @MaxLength(100) confidentiality?: string;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class UpdateArtifactDto {
  @IsOptional() @IsString() @MaxLength(240) name?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsString() @MaxLength(100) category?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsString() @MaxLength(100) versionLabel?: string;
  @IsOptional() @IsString() @MaxLength(100) confidentiality?: string;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class CreateArtifactLinkDto {
  @IsEnum(FileAttachmentEntityType) entityType!: FileAttachmentEntityType;
  @IsUUID() entityId!: string;
  @IsOptional() @IsEnum(ArtifactRelationType) relationType?: ArtifactRelationType;
}

export class FindArtifactsDto extends PaginationDto {
  @IsOptional() @IsEnum(FileAttachmentEntityType) entityType?: FileAttachmentEntityType;
  @IsOptional() @IsUUID() entityId?: string;
  @IsOptional() @IsEnum(ArtifactType) type?: ArtifactType;
  @IsOptional() @IsEnum(ArtifactProvider) provider?: ArtifactProvider;
  @IsOptional() @IsEnum(ArtifactRelationType) relationType?: ArtifactRelationType;
  @IsOptional() @IsString() @MaxLength(200) search?: string;
  @IsOptional() @IsDateString() createdFrom?: string;
  @IsOptional() @IsDateString() createdTo?: string;
}
