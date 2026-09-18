-- AlterTable
ALTER TABLE "companies"
ADD COLUMN "archivedAt" TIMESTAMP(3),
ADD COLUMN "archivedById" TEXT,
ADD COLUMN "archiveReason" TEXT;

CREATE INDEX "companies_archivedAt_idx" ON "companies"("archivedAt");

ALTER TABLE "companies"
ADD CONSTRAINT "companies_archivedById_fkey"
FOREIGN KEY ("archivedById") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
