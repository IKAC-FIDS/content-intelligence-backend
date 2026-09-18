import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, SalesChannel, UserRole } from "@prisma/client";
import { AuditLogService } from "../audit-log/audit-log.service";
import { CurrentUserPayload } from "../common/decorators/current-user.decorator";
import { userTeamScopeWhere } from "../common/tenant/team-scope.util";
import { PrismaService } from "../prisma/prisma.service";
import { CreateOpportunityLineItemDto } from "./dto/create-opportunity-line-item.dto";
import { UpdateOpportunityLineItemDto } from "./dto/update-opportunity-line-item.dto";

const lineItemInclude = {
  product: {
    select: {
      id: true,
      code: true,
      name: true,
      category: true,
      unit: true,
      defaultUnitPrice: true,
      inPersonPriceIrr: true,
      digikalaPriceIrr: true,
      currency: true,
      isActive: true,
    },
  },
  productPriceHistory: {
    select: { id: true, reason: true, validFrom: true, validTo: true },
  },
} satisfies Prisma.OpportunityLineItemInclude;

@Injectable()
export class OpportunityLineItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  async findAll(opportunityId: string, user: CurrentUserPayload) {
    await this.getOpportunityForView(opportunityId, user);

    return this.prisma.opportunityLineItem.findMany({
      where: { opportunityId },
      include: lineItemInclude,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
  }

  async findOne(
    opportunityId: string,
    lineItemId: string,
    user: CurrentUserPayload,
  ) {
    await this.getOpportunityForView(opportunityId, user);

    const item = await this.prisma.opportunityLineItem.findFirst({
      where: {
        id: lineItemId,
        opportunityId,
      },
      include: lineItemInclude,
    });

    if (!item) {
      throw new NotFoundException("آیتم فرصت فروش پیدا نشد");
    }

    return item;
  }

  async create(
    opportunityId: string,
    dto: CreateOpportunityLineItemDto,
    user: CurrentUserPayload,
  ) {
    const opportunity = await this.getOpportunityForMutation(
      opportunityId,
      user,
    );
    const product = dto.productId
      ? await this.getActiveProduct(dto.productId)
      : null;
    const salesChannel = this.writeChannel(dto.salesChannel, Boolean(product));
    const priceSnapshot = await this.resolveCatalogSnapshot(
      product,
      salesChannel,
    );

    const quantity = this.toPositiveDecimal(dto.quantity, "quantity");
    const unitPrice =
      dto.unitPrice !== undefined
        ? this.toNonNegativeDecimal(dto.unitPrice, "unitPrice")
        : (priceSnapshot.catalogPrice ?? new Prisma.Decimal(0));
    if (!product && dto.unitPrice === undefined)
      throw new BadRequestException(
        "unitPrice is required when productId is not supplied",
      );
    if (salesChannel === SalesChannel.OTHER && dto.unitPrice === undefined)
      throw new BadRequestException(
        "unitPrice is required for OTHER sales channel",
      );

    const discountAmount = this.toNonNegativeDecimal(
      dto.discountAmount ?? 0,
      "discountAmount",
    );
    const taxAmount = this.toNonNegativeDecimal(
      dto.taxAmount ?? 0,
      "taxAmount",
    );
    const lineTotal = this.calculateLineTotal(
      quantity,
      unitPrice,
      discountAmount,
      taxAmount,
    );

    const item = await this.prisma.opportunityLineItem.create({
      data: {
        opportunityId: opportunity.id,
        productId: product?.id ?? null,
        productCodeSnapshot: product?.code ?? "CUSTOM",
        productNameSnapshot:
          product?.name ?? dto.description?.trim() ?? "Custom item",
        salesChannel,
        catalogUnitPriceIrrSnapshot: priceSnapshot.catalogPrice,
        productPriceHistoryId: priceSnapshot.historyId,
        description: dto.description?.trim() || undefined,
        quantity,
        unitPrice,
        discountAmount,
        taxAmount,
        lineTotal,
        sortOrder: dto.sortOrder ?? 0,
      },
      include: lineItemInclude,
    });

    await this.recalculateOpportunityEstimatedValue(opportunity.id);

    await this.audit.record({
      actorId: user.userId,
      entityType: "opportunity-line-item",
      entityId: item.id,
      action: "opportunity.line_item_created",
      after: item,
      metadata: {
        opportunityId: opportunity.id,
      },
    });

    return item;
  }

  async update(
    opportunityId: string,
    lineItemId: string,
    dto: UpdateOpportunityLineItemDto,
    user: CurrentUserPayload,
  ) {
    const opportunity = await this.getOpportunityForMutation(
      opportunityId,
      user,
    );

    const current = await this.prisma.opportunityLineItem.findFirst({
      where: {
        id: lineItemId,
        opportunityId,
      },
      include: lineItemInclude,
    });

    if (!current) {
      throw new NotFoundException("آیتم فرصت فروش پیدا نشد");
    }

    let productId = current.productId;
    let productCodeSnapshot = current.productCodeSnapshot;
    let productNameSnapshot = current.productNameSnapshot;
    let salesChannel = current.salesChannel;
    let catalogUnitPriceIrrSnapshot = current.catalogUnitPriceIrrSnapshot;
    let productPriceHistoryId = current.productPriceHistoryId;
    let selectedProduct = current.product;

    if (dto.productId !== undefined) {
      selectedProduct = dto.productId
        ? await this.getActiveProduct(dto.productId)
        : null;
      productId = selectedProduct?.id ?? null;
      productCodeSnapshot = selectedProduct?.code ?? "CUSTOM";
      productNameSnapshot =
        selectedProduct?.name ??
        dto.description?.trim() ??
        current.productNameSnapshot;
    }
    if (dto.salesChannel === SalesChannel.LEGACY_UNKNOWN)
      throw new BadRequestException(
        "LEGACY_UNKNOWN cannot be selected for writes",
      );
    const pricingSelectionChanged =
      dto.productId !== undefined || dto.salesChannel !== undefined;
    if (pricingSelectionChanged) {
      salesChannel = this.writeChannel(
        dto.salesChannel ??
          (selectedProduct ? SalesChannel.IN_PERSON : SalesChannel.OTHER),
        Boolean(selectedProduct),
      );
      const snapshot = await this.resolveCatalogSnapshot(
        selectedProduct,
        salesChannel,
      );
      catalogUnitPriceIrrSnapshot = snapshot.catalogPrice;
      productPriceHistoryId = snapshot.historyId;
    }

    const quantity =
      dto.quantity !== undefined
        ? this.toPositiveDecimal(dto.quantity, "quantity")
        : new Prisma.Decimal(current.quantity);

    const unitPrice =
      dto.unitPrice !== undefined
        ? this.toNonNegativeDecimal(dto.unitPrice, "unitPrice")
        : pricingSelectionChanged && catalogUnitPriceIrrSnapshot
          ? new Prisma.Decimal(catalogUnitPriceIrrSnapshot)
          : new Prisma.Decimal(current.unitPrice);
    if (
      !selectedProduct &&
      dto.unitPrice === undefined &&
      pricingSelectionChanged
    )
      throw new BadRequestException(
        "unitPrice is required when productId is not supplied",
      );
    if (
      salesChannel === SalesChannel.OTHER &&
      dto.unitPrice === undefined &&
      pricingSelectionChanged
    )
      throw new BadRequestException(
        "unitPrice is required for OTHER sales channel",
      );

    const discountAmount =
      dto.discountAmount !== undefined
        ? this.toNonNegativeDecimal(dto.discountAmount, "discountAmount")
        : new Prisma.Decimal(current.discountAmount);

    const taxAmount =
      dto.taxAmount !== undefined
        ? this.toNonNegativeDecimal(dto.taxAmount, "taxAmount")
        : new Prisma.Decimal(current.taxAmount);

    const lineTotal = this.calculateLineTotal(
      quantity,
      unitPrice,
      discountAmount,
      taxAmount,
    );

    const data: Prisma.OpportunityLineItemUncheckedUpdateInput = {
      productId,
      productCodeSnapshot,
      productNameSnapshot,
      quantity,
      unitPrice,
      discountAmount,
      taxAmount,
      lineTotal,
      salesChannel,
      catalogUnitPriceIrrSnapshot,
      productPriceHistoryId,
    };

    if (dto.description !== undefined) {
      data.description = dto.description?.trim() || null;
    }

    if (dto.sortOrder !== undefined) {
      data.sortOrder = dto.sortOrder;
    }

    const updated = await this.prisma.opportunityLineItem.update({
      where: { id: lineItemId },
      data,
      include: lineItemInclude,
    });

    await this.recalculateOpportunityEstimatedValue(opportunity.id);

    await this.audit.record({
      actorId: user.userId,
      entityType: "opportunity-line-item",
      entityId: lineItemId,
      action: "opportunity.line_item_updated",
      before: current,
      after: updated,
      metadata: {
        opportunityId: opportunity.id,
      },
    });

    return updated;
  }

  async remove(
    opportunityId: string,
    lineItemId: string,
    user: CurrentUserPayload,
  ) {
    const opportunity = await this.getOpportunityForMutation(
      opportunityId,
      user,
    );

    const current = await this.prisma.opportunityLineItem.findFirst({
      where: {
        id: lineItemId,
        opportunityId,
      },
    });

    if (!current) {
      throw new NotFoundException("آیتم فرصت فروش پیدا نشد");
    }

    const deleted = await this.prisma.opportunityLineItem.delete({
      where: { id: lineItemId },
    });

    await this.recalculateOpportunityEstimatedValue(opportunity.id);

    await this.audit.record({
      actorId: user.userId,
      entityType: "opportunity-line-item",
      entityId: lineItemId,
      action: "opportunity.line_item_deleted",
      before: current,
      metadata: {
        opportunityId: opportunity.id,
      },
    });

    return deleted;
  }

  private async getOpportunityForView(
    opportunityId: string,
    user: CurrentUserPayload,
  ) {
    const opportunity = await this.prisma.opportunity.findFirst({
      where: {
        AND: [{ id: opportunityId }, this.opportunityScopeWhere(user)],
      },
      include: {
        company: {
          include: {
            owner: {
              select: {
                id: true,
                team: true,
              },
            },
          },
        },
      },
    });

    if (!opportunity) {
      throw new NotFoundException("Opportunity not found");
    }

    return opportunity;
  }

  private async getOpportunityForMutation(
    opportunityId: string,
    user: CurrentUserPayload,
  ) {
    if (user.role === UserRole.BOARDS) {
      throw new ForbiddenException("Opportunity is read-only for this role");
    }

    const opportunity = await this.getOpportunityForView(opportunityId, user);

    if (opportunity.archivedAt) {
      throw new BadRequestException("Archived opportunities cannot be changed");
    }

    return opportunity;
  }

  private opportunityScopeWhere(
    user: CurrentUserPayload,
  ): Prisma.OpportunityWhereInput {
    if (user.role === UserRole.ADMIN || user.role === UserRole.BOARDS) {
      return {};
    }

    if (user.role === UserRole.MANAGER) {
      return user.teamId || user.team
        ? { company: { owner: userTeamScopeWhere(user) } }
        : { id: { in: [] } };
    }

    return {
      OR: [{ ownerId: user.userId }, { company: { ownerId: user.userId } }],
    };
  }

  private async getActiveProduct(productId: string) {
    const product = await this.prisma.productCatalogItem.findUnique({
      where: { id: productId },
    });

    if (!product || !product.isActive) {
      throw new BadRequestException(
        "محصول یا سرویس انتخاب‌شده معتبر یا فعال نیست",
      );
    }

    return product;
  }

  private writeChannel(channel: SalesChannel | undefined, hasProduct: boolean) {
    const result =
      channel ?? (hasProduct ? SalesChannel.IN_PERSON : SalesChannel.OTHER);
    if (result === SalesChannel.LEGACY_UNKNOWN)
      throw new BadRequestException(
        "LEGACY_UNKNOWN cannot be selected for writes",
      );
    if (!hasProduct && result !== SalesChannel.OTHER)
      throw new BadRequestException(
        "A catalog product is required for IN_PERSON or DIGIKALA",
      );
    return result;
  }

  private async resolveCatalogSnapshot(
    product: {
      id: string;
      inPersonPriceIrr: Prisma.Decimal;
      digikalaPriceIrr: Prisma.Decimal;
    } | null,
    channel: SalesChannel,
  ) {
    if (!product || channel === SalesChannel.OTHER)
      return { catalogPrice: null, historyId: null };
    const history = await this.prisma.productPriceHistory.findFirst({
      where: { productId: product.id, validTo: null },
      select: { id: true },
    });
    if (!history)
      throw new BadRequestException("Current product price history is missing");
    return {
      catalogPrice: new Prisma.Decimal(
        channel === SalesChannel.DIGIKALA
          ? product.digikalaPriceIrr
          : product.inPersonPriceIrr,
      ),
      historyId: history.id,
    };
  }

  private toPositiveDecimal(value: number, fieldName: string) {
    const decimal = new Prisma.Decimal(value);

    if (decimal.lessThanOrEqualTo(0)) {
      throw new BadRequestException(`${fieldName} باید بزرگ‌تر از صفر باشد`);
    }

    return decimal;
  }

  private toNonNegativeDecimal(value: number, fieldName: string) {
    const decimal = new Prisma.Decimal(value);

    if (decimal.lessThan(0)) {
      throw new BadRequestException(`${fieldName} نمی‌تواند منفی باشد`);
    }

    return decimal;
  }

  private calculateLineTotal(
    quantity: Prisma.Decimal,
    unitPrice: Prisma.Decimal,
    discountAmount: Prisma.Decimal,
    taxAmount: Prisma.Decimal,
  ) {
    const lineTotal = quantity
      .mul(unitPrice)
      .minus(discountAmount)
      .plus(taxAmount);

    if (lineTotal.lessThan(0)) {
      throw new BadRequestException("مبلغ نهایی آیتم نمی‌تواند منفی باشد");
    }

    return lineTotal;
  }

  private async recalculateOpportunityEstimatedValue(opportunityId: string) {
    const aggregate = await this.prisma.opportunityLineItem.aggregate({
      where: { opportunityId },
      _count: { _all: true },
      _sum: { lineTotal: true },
    });

    await this.prisma.opportunity.update({
      where: { id: opportunityId },
      data: {
        estimatedValue:
          aggregate._count._all > 0
            ? (aggregate._sum.lineTotal ?? new Prisma.Decimal(0))
            : null,
      },
    });
  }
}
