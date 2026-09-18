import { Type } from 'class-transformer';
import { IsArray, IsInt, IsUUID, ValidateNested } from 'class-validator';

class ReorderStageItemDto {
  @IsUUID() id!: string;
  @IsInt() sortOrder!: number;
}

export class ReorderStagesDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => ReorderStageItemDto)
  items!: ReorderStageItemDto[];
}
