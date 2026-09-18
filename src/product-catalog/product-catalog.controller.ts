import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  CurrentUser,
  CurrentUserPayload,
} from "../common/decorators/current-user.decorator";
import { Permissions } from "../common/decorators/permissions.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { CreateProductCatalogItemDto } from "./dto/create-product-catalog-item.dto";
import { FindProductCatalogItemsDto } from "./dto/find-product-catalog-items.dto";
import { UpdateProductCatalogItemDto } from "./dto/update-product-catalog-item.dto";
import { ProductCatalogService } from "./product-catalog.service";
import { ProductPriceHistoryService } from "./product-price-history.service";
import { FindProductPriceHistoryDto } from "./dto/find-product-price-history.dto";

@Controller("product-catalog")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ProductCatalogController {
  constructor(
    private readonly service: ProductCatalogService,
    private readonly history: ProductPriceHistoryService,
  ) {}

  @Get(":id/price-history")
  @Permissions("product:view")
  priceHistory(
    @Param("id") id: string,
    @Query() query: FindProductPriceHistoryDto,
  ) {
    return this.history.findAll(id, query);
  }

  @Get()
  @Permissions("product:view")
  findAll(@Query() query: FindProductCatalogItemsDto) {
    return this.service.findAll(query);
  }

  @Post()
  @Permissions("product:manage")
  create(
    @Body() dto: CreateProductCatalogItemDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.create(dto, user);
  }

  @Get(":id")
  @Permissions("product:view")
  findOne(@Param("id") id: string) {
    return this.service.findOne(id);
  }

  @Patch(":id")
  @Permissions("product:manage")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateProductCatalogItemDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.update(id, dto, user);
  }

  @Patch(":id/activate")
  @Permissions("product:manage")
  activate(@Param("id") id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.activate(id, user);
  }

  @Patch(":id/deactivate")
  @Permissions("product:manage")
  deactivate(@Param("id") id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.deactivate(id, user);
  }
}
