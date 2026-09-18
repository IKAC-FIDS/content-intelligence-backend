ALTER TABLE "tender_requirements"
  ADD COLUMN "opportunityLineItemId" TEXT;

CREATE INDEX "tender_requirements_opportunityLineItemId_idx"
  ON "tender_requirements"("opportunityLineItemId");

ALTER TABLE "tender_requirements"
  ADD CONSTRAINT "tender_requirements_opportunityLineItemId_fkey"
  FOREIGN KEY ("opportunityLineItemId")
  REFERENCES "opportunity_line_items"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
