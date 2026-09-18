CREATE TABLE "person_employment_history" (
  "id" TEXT NOT NULL,
  "personId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "companyNameSnapshot" TEXT,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "person_employment_history_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "person_employment_history_personId_companyId_key" ON "person_employment_history"("personId", "companyId");
CREATE INDEX "person_employment_history_companyId_idx" ON "person_employment_history"("companyId");
ALTER TABLE "person_employment_history" ADD CONSTRAINT "person_employment_history_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "person_employment_history" ADD CONSTRAINT "person_employment_history_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "person_employment_positions" (
  "id" TEXT NOT NULL,
  "employmentHistoryId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "startDate" TIMESTAMP(3),
  "endDate" TIMESTAMP(3),
  "isCurrent" BOOLEAN NOT NULL DEFAULT false,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "person_employment_positions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "person_employment_positions_date_order" CHECK ("startDate" IS NULL OR "endDate" IS NULL OR "endDate" >= "startDate"),
  CONSTRAINT "person_employment_positions_current_end_date" CHECK (NOT "isCurrent" OR "endDate" IS NULL)
);
CREATE INDEX "person_employment_positions_employmentHistoryId_idx" ON "person_employment_positions"("employmentHistoryId");
ALTER TABLE "person_employment_positions" ADD CONSTRAINT "person_employment_positions_employmentHistoryId_fkey" FOREIGN KEY ("employmentHistoryId") REFERENCES "person_employment_history"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "person_education_history" (
  "id" TEXT NOT NULL,
  "personId" TEXT NOT NULL,
  "degree" TEXT,
  "university" TEXT,
  "year" INTEGER,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "person_education_history_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "person_education_history_year_range" CHECK ("year" IS NULL OR ("year" >= 1000 AND "year" <= 3000)),
  CONSTRAINT "person_education_history_meaningful" CHECK (NULLIF(BTRIM("degree"), '') IS NOT NULL OR NULLIF(BTRIM("university"), '') IS NOT NULL OR "year" IS NOT NULL OR NULLIF(BTRIM("description"), '') IS NOT NULL)
);
CREATE INDEX "person_education_history_personId_idx" ON "person_education_history"("personId");
ALTER TABLE "person_education_history" ADD CONSTRAINT "person_education_history_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;
