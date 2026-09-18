import { Injectable, NotFoundException } from "@nestjs/common";
import { PricingCurrency, Prisma, ProductPriceHistoryReason } from "@prisma/client";
import { parseApiDateRange } from "../common/dates/api-date.util";
import { PrismaService } from "../prisma/prisma.service";
import { FindProductPriceHistoryDto } from "./dto/find-product-price-history.dto";

type PricingSnapshot = {
  pricingCurrency: PricingCurrency;
  inPersonInputPrice: Prisma.Decimal | string;
  digikalaInputPrice: Prisma.Decimal | string;
  inPersonProfitPercent: Prisma.Decimal | string | null;
  digikalaProfitPercent: Prisma.Decimal | string | null;
  inPersonPriceIrr: Prisma.Decimal | string;
  digikalaPriceIrr: Prisma.Decimal | string;
  calculatedExchangeRateId: string | null;
};

@Injectable()
export class ProductPriceHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(productId: string, query: FindProductPriceHistoryDto) {
    const product = await this.prisma.productCatalogItem.findUnique({
      where: { id: productId },
      select: { id: true },
    });
    if (!product) throw new NotFoundException("Product not found");
    const page = query.page ?? 1,
      limit = query.limit ?? 20;
    const range = parseApiDateRange(
      query.dateFrom,
      query.dateTo,
      "dateFrom",
      "dateTo",
    );
    const where: Prisma.ProductPriceHistoryWhereInput = {
      productId,
      ...(query.reason && { reason: query.reason }),
      ...(range && { validFrom: range }),
    };
    const [data, total] = await Promise.all([
      this.prisma.productPriceHistory.findMany({
        where,
        select: {
          id: true,
          productId: true,
          pricingCurrency: true,
          inPersonInputPrice: true,
          digikalaInputPrice: true,
          inPersonProfitPercent: true,
          digikalaProfitPercent: true,
          inPersonPriceIrr: true,
          digikalaPriceIrr: true,
          calculatedExchangeRateId: true,
          exchangeRateValueSnapshot: true,
          reason: true,
          validFrom: true,
          validTo: true,
          changedBy: { select: { id: true, fullName: true, email: true } },
          note: true,
          createdAt: true,
        },
        orderBy: [{ validFrom: "desc" }, { id: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.productPriceHistory.count({ where }),
    ]);
    const totalPages = Math.ceil(total / limit);
    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasNext: page < totalPages,
        hasPrevious: page > 1,
      },
    };
  }

  async append(
    client: Prisma.TransactionClient,
    productId: string,
    snapshot: PricingSnapshot,
    reason: ProductPriceHistoryReason,
    validFrom: Date,
    changedById: string | null,
    note?: string | null,
  ) {
    const rate = snapshot.calculatedExchangeRateId
      ? await client.currencyExchangeRate.findUnique({
          where: { id: snapshot.calculatedExchangeRateId },
          select: { rate: true },
        })
      : null;
    await client.productPriceHistory.updateMany({
      where: { productId, validTo: null },
      data: { validTo: validFrom },
    });
    return client.productPriceHistory.create({
      data: {
        productId,
        pricingCurrency: snapshot.pricingCurrency,
        inPersonInputPrice: snapshot.inPersonInputPrice,
        digikalaInputPrice: snapshot.digikalaInputPrice,
        inPersonProfitPercent: snapshot.inPersonProfitPercent,
        digikalaProfitPercent: snapshot.digikalaProfitPercent,
        inPersonPriceIrr: snapshot.inPersonPriceIrr,
        digikalaPriceIrr: snapshot.digikalaPriceIrr,
        calculatedExchangeRateId: snapshot.calculatedExchangeRateId,
        exchangeRateValueSnapshot: rate?.rate ?? null,
        reason,
        validFrom,
        changedById,
        note: note?.trim() || null,
      },
    });
  }
}
