import { FileAttachmentEntityType } from '@prisma/client';
import { IsEnum, IsUUID } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class FindAttachmentsDto extends PaginationDto {
  @IsEnum(FileAttachmentEntityType)
  entityType!: FileAttachmentEntityType;

  @IsUUID()
  entityId!: string;
}