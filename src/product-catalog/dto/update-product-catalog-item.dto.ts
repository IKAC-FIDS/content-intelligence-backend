import { PartialType } from '@nestjs/mapped-types';
import { CreateProductCatalogItemDto } from './create-product-catalog-item.dto';

export class UpdateProductCatalogItemDto extends PartialType(
  CreateProductCatalogItemDto,
) {}