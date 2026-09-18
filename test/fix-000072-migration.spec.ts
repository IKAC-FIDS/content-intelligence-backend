import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(
  join(
    process.cwd(),
    "prisma/migrations/20260720210000_add_sales_channels_product_price_history/migration.sql",
  ),
  "utf8",
);

describe("fix 000072 migration safety", () => {
  it("backfills existing line items without changing monetary values", () => {
    expect(sql).toContain(`DEFAULT 'LEGACY_UNKNOWN'`);
    expect(sql).toMatch(/SET "catalogUnitPriceIrrSnapshot" = "unitPrice"/);
    expect(sql).not.toMatch(
      /UPDATE "opportunity_line_items"[\s\S]*SET[\s\S]*"(?:quantity|unitPrice|discountAmount|taxAmount|lineTotal)"\s*=/,
    );
  });

  it("creates one deployment-time baseline row per existing product", () => {
    expect(sql).toContain(`'MIGRATION_BASELINE'::"ProductPriceHistoryReason"`);
    expect(sql).toContain('FROM "product_catalog_items" p');
    expect(sql).toContain("CURRENT_TIMESTAMP AS captured_at");
    expect(sql).not.toContain('p."createdAt"');
    expect(sql).not.toContain('p."updatedAt"');
  });

  it("enforces a single open history row and contains no destructive reset", () => {
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX "product_price_histories_one_open_per_product"[\s\S]*WHERE "validTo" IS NULL/,
    );
    expect(sql).not.toMatch(/DROP TABLE|TRUNCATE|DELETE FROM/i);
  });
});
