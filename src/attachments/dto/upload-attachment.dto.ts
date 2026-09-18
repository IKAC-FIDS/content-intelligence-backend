import { ArtifactRelationType, FileAttachmentEntityType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class UploadAttachmentDto {
  @IsEnum(FileAttachmentEntityType)
  entityType!: FileAttachmentEntityType;

  @IsUUID()
  entityId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  name?: string;

  @IsOptional()
  @IsEnum(ArtifactRelationType)
  relationType?: ArtifactRelationType;
}
