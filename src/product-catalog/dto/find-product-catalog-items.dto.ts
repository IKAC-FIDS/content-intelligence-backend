import { IsBooleanString, IsEnum, IsOptional, IsString } from 'class-validator';
import { ProductType } from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class FindProductCatalogItemsDto extends PaginationDto {
  @IsOptional()
  @IsEnum(ProductType)
  type?: ProductType;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsBooleanString()
  active?: string;
}
