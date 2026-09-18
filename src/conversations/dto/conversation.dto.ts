import { ConversationMessageType, ConversationThreadStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class FindConversationDto extends PaginationDto {}

export class CreateConversationMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body!: string;

  @IsEnum(ConversationMessageType)
  type: ConversationMessageType = ConversationMessageType.COMMENT;

  @IsOptional()
  @IsUUID()
  parentMessageId?: string;
}

export class UpdateConversationMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body!: string;
}

export class UpdateConversationStatusDto {
  @IsEnum(ConversationThreadStatus)
  status!: ConversationThreadStatus;
}
