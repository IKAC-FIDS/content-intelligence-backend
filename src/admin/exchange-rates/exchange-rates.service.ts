import { BadRequestException, Injectable } from "@nestjs/common";
import {
  PricingCurrency,
  Prisma,
  ProductPriceHistoryReason,
} from "@prisma/client";
import { AuditLogService } from "../../audit-log/audit-log.service";
import { CurrentUserPayload } from "../../common/decorators/current-user.decorator";
import { parseApiDate } from "../../common/dates/api-date.util";
import { PrismaService } from "../../prisma/prisma.service";
import { ProductPricingService } from "../../product-catalog/product-pricing.service";
import { ProductPriceHistoryService } from "../../product-catalog/product-price-history.service";
import { CreateExchangeRateDto } from "./dto/create-exchange-rate.dto";
import { FindExchangeRatesDto } from "./dto/find-exchange-rates.dto";

const include = {
  createdBy: { select: { id: true, fullName: true, email: true } },
} satisfies Prisma.CurrencyExchangeRateInclude;
@Injectable()
export class ExchangeRatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: ProductPricingService,
    private readonly audit: AuditLogService,
    private readonly history: ProductPriceHistoryService,
  ) {}

  async current() {
    const rate = await this.prisma.currencyExchangeRate.findFirst({
      where: {
        baseCurrency: "USD",
        quoteCurrency: "IRR",
        validFrom: { lte: new Date() },
        validTo: null,
      },
      include,
      orderBy: { validFrom: "desc" },
    });
    return rate ? this.withStatus(rate) : null;
  }
  async findAll(query: FindExchangeRatesDto) {
    const page = query.page ?? 1,
      limit = query.limit ?? 20;
    const where = { baseCurrency: "USD", quoteCurrency: "IRR" };
    const [data, total] = await Promise.all([
      this.prisma.currencyExchangeRate.findMany({
        where,
        include,
        orderBy: { validFrom: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.currencyExchangeRate.count({ where }),
    ]);
    const totalPages = Math.ceil(total / limit);
    return {
      data: data.map((v) => this.withStatus(v)),
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

  async create(dto: CreateExchangeRateDto, user: CurrentUserPayload) {
    const rate = new Prisma.Decimal(dto.rate);
    if (rate.lessThanOrEqualTo(0))
      throw new BadRequestException("Exchange rate must be greater than zero");
    const effectiveFrom = dto.effectiveFrom
      ? parseApiDate(dto.effectiveFrom, "effectiveFrom")
      : new Date();
    if (effectiveFrom > new Date())
      throw new BadRequestException("effectiveFrom cannot be in the future");
    const result = await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw<Array<{ lockResult: string | null }>>(Prisma.sql`
        SELECT CAST(
          pg_advisory_xact_lock(89241377)
          AS TEXT
        ) AS "lockResult"
      `);
        const active = await tx.currencyExchangeRate.findFirst({
          where: { baseCurrency: "USD", quoteCurrency: "IRR", validTo: null },
          orderBy: { validFrom: "desc" },
        });
        if (active && effectiveFrom <= active.validFrom)
          throw new BadRequestException(
            "effectiveFrom must be after the active rate validFrom",
          );
        const overlap = await tx.currencyExchangeRate.findFirst({
          where: {
            baseCurrency: "USD",
            quoteCurrency: "IRR",
            validFrom: { lt: effectiveFrom },
            OR: [{ validTo: null }, { validTo: { gt: effectiveFrom } }],
          },
        });
        if (overlap && overlap.id !== active?.id)
          throw new BadRequestException("Exchange-rate periods cannot overlap");
        if (active)
          await tx.currencyExchangeRate.update({
            where: { id: active.id },
            data: { validTo: effectiveFrom },
          });
        const created = await tx.currencyExchangeRate.create({
          data: {
            rate,
            validFrom: effectiveFrom,
            createdById: user.userId,
            note: dto.note?.trim() || undefined,
          },
          include,
        });
        const products = await tx.productCatalogItem.findMany({
          where: { pricingCurrency: PricingCurrency.USD },
          select: {
            id: true,
            pricingCurrency: true,
            inPersonInputPrice: true,
            digikalaInputPrice: true,
            inPersonProfitPercent: true,
            digikalaProfitPercent: true,
          },
        });
        const historyAt = new Date();
        for (const product of products) {
          const prices = this.pricing.calculateUsd(
            product,
            created.id,
            rate,
            historyAt,
          );
          const updated = await tx.productCatalogItem.update({
            where: { id: product.id },
            data: {
              ...prices,
              defaultUnitPrice: prices.inPersonPriceIrr,
              currency: "IRR",
            },
          });
          await this.history.append(
            tx,
            product.id,
            updated,
            ProductPriceHistoryReason.EXCHANGE_RATE_CHANGED,
            historyAt,
            user.userId,
            dto.note,
          );
        }
        return {
          created,
          previous: active,
          recalculatedProductCount: products.length,
        };
      },
      { timeout: 60000 },
    );
    await this.audit.record({
      actorId: user.userId,
      entityType: "currency-exchange-rate",
      entityId: result.created.id,
      action: "exchange_rate.created",
      before: result.previous,
      after: result.created,
      metadata: {
        effectiveFrom,
        recalculatedProductCount: result.recalculatedProductCount,
      },
    });
    return {
      rate: this.withStatus(result.created),
      recalculatedProductCount: result.recalculatedProductCount,
    };
  }
  private withStatus<T extends { validFrom: Date; validTo: Date | null }>(
    rate: T,
  ) {
    const now = new Date();
    return {
      ...rate,
      status:
        rate.validFrom <= now && rate.validTo === null
          ? "ACTIVE"
          : "HISTORICAL",
    };
  }
}
