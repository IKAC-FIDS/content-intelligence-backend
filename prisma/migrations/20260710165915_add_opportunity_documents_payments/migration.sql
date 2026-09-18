CREATE TYPE "CommercialDocumentType" AS ENUM ('PROPOSAL', 'PROFORMA', 'CONTRACT');

CREATE TYPE "CommercialDocumentStatus" AS ENUM (
  'DRAFT',
  'SENT',
  'ACCEPTED',
  'REJECTED',
  'SIGNED',
  'CANCELLED',
  'EXPIRED'
);

CREATE TYPE "PaymentStatus" AS ENUM (
  'PENDING',
  'PARTIAL',
  'PAID',
  'OVERDUE',
  'CANCELLED',
  'REFUNDED'
);

CREATE TYPE "PaymentMethod" AS ENUM (
  'BANK_TRANSFER',
  'CASH',
  'CHECK',
  'CARD',
  'OTHER'
);

CREATE TABLE "opportunity_commercial_documents" (
                                                    "id" TEXT NOT NULL,
                                                    "opportunityId" TEXT NOT NULL,
                                                    "type" "CommercialDocumentType" NOT NULL,
                                                    "status" "CommercialDocumentStatus" NOT NULL DEFAULT 'DRAFT',
                                                    "number" TEXT,
                                                    "version" INTEGER NOT NULL DEFAULT 1,
                                                    "title" TEXT NOT NULL,
                                                    "description" TEXT,
                                                    "amount" DECIMAL(18,2),
                                                    "currency" TEXT NOT NULL DEFAULT 'IRR',
                                                    "validUntil" TIMESTAMP(3),
                                                    "issuedAt" TIMESTAMP(3),
                                                    "sentAt" TIMESTAMP(3),
                                                    "acceptedAt" TIMESTAMP(3),
                                                    "rejectedAt" TIMESTAMP(3),
                                                    "signedAt" TIMESTAMP(3),
                                                    "fileUrl" TEXT,
                                                    "externalRef" TEXT,
                                                    "notes" TEXT,
                                                    "createdById" TEXT,
                                                    "updatedById" TEXT,
                                                    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                                    "updatedAt" TIMESTAMP(3) NOT NULL,

                                                    CONSTRAINT "opportunity_commercial_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "opportunity_payments" (
                                        "id" TEXT NOT NULL,
                                        "opportunityId" TEXT NOT NULL,
                                        "commercialDocumentId" TEXT,
                                        "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
                                        "amount" DECIMAL(18,2) NOT NULL,
                                        "currency" TEXT NOT NULL DEFAULT 'IRR',
                                        "dueDate" TIMESTAMP(3),
                                        "paidAt" TIMESTAMP(3),
                                        "method" "PaymentMethod",
                                        "referenceNumber" TEXT,
                                        "description" TEXT,
                                        "notes" TEXT,
                                        "createdById" TEXT,
                                        "updatedById" TEXT,
                                        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                        "updatedAt" TIMESTAMP(3) NOT NULL,

                                        CONSTRAINT "opportunity_payments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "opportunity_commercial_documents_opportunityId_idx" ON "opportunity_commercial_documents"("opportunityId");
CREATE INDEX "opportunity_commercial_documents_type_idx" ON "opportunity_commercial_documents"("type");
CREATE INDEX "opportunity_commercial_documents_status_idx" ON "opportunity_commercial_documents"("status");
CREATE INDEX "opportunity_commercial_documents_number_idx" ON "opportunity_commercial_documents"("number");
CREATE INDEX "opportunity_commercial_documents_createdAt_idx" ON "opportunity_commercial_documents"("createdAt");

CREATE INDEX "opportunity_payments_opportunityId_idx" ON "opportunity_payments"("opportunityId");
CREATE INDEX "opportunity_payments_commercialDocumentId_idx" ON "opportunity_payments"("commercialDocumentId");
CREATE INDEX "opportunity_payments_status_idx" ON "opportunity_payments"("status");
CREATE INDEX "opportunity_payments_dueDate_idx" ON "opportunity_payments"("dueDate");
CREATE INDEX "opportunity_payments_paidAt_idx" ON "opportunity_payments"("paidAt");

ALTER TABLE "opportunity_commercial_documents"
    ADD CONSTRAINT "opportunity_commercial_documents_opportunityId_fkey"
        FOREIGN KEY ("opportunityId") REFERENCES "opportunities"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "opportunity_payments"
    ADD CONSTRAINT "opportunity_payments_opportunityId_fkey"
        FOREIGN KEY ("opportunityId") REFERENCES "opportunities"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "opportunity_payments"
    ADD CONSTRAINT "opportunity_payments_commercialDocumentId_fkey"
        FOREIGN KEY ("commercialDocumentId") REFERENCES "opportunity_commercial_documents"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;