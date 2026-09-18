CREATE TYPE "PersonEducationDegree" AS ENUM ('DIPLOMA', 'ASSOCIATE', 'BACHELOR', 'PHD', 'POSTDOC');

CREATE TABLE "universities" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "universities_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "universities_name_key" ON "universities"("name");
CREATE UNIQUE INDEX "universities_code_key" ON "universities"("code");
CREATE INDEX "universities_isActive_idx" ON "universities"("isActive");

ALTER TABLE "person_education_history"
  DROP CONSTRAINT IF EXISTS "person_education_history_meaningful",
  ADD COLUMN "degree_new" "PersonEducationDegree",
  ADD COLUMN "degreeNameSnapshot" TEXT,
  ADD COLUMN "universityId" TEXT,
  ADD COLUMN "universityNameSnapshot" TEXT,
  ADD COLUMN "educationDate" TIMESTAMP(3);

UPDATE "person_education_history"
SET
  "degreeNameSnapshot" = NULLIF(BTRIM("degree"), ''),
  "universityNameSnapshot" = NULLIF(BTRIM("university"), ''),
  "educationDate" = CASE WHEN "year" BETWEEN 1 AND 9999 THEN MAKE_DATE("year", 1, 1)::TIMESTAMP ELSE NULL END,
  "degree_new" = CASE UPPER(BTRIM(COALESCE("degree", '')))
    WHEN 'DIPLOMA' THEN 'DIPLOMA'::"PersonEducationDegree"
    WHEN 'ASSOCIATE' THEN 'ASSOCIATE'::"PersonEducationDegree"
    WHEN 'BACHELOR' THEN 'BACHELOR'::"PersonEducationDegree"
    WHEN 'PHD' THEN 'PHD'::"PersonEducationDegree"
    WHEN 'POSTDOC' THEN 'POSTDOC'::"PersonEducationDegree"
    ELSE NULL
  END;

ALTER TABLE "person_education_history"
  DROP COLUMN "degree",
  DROP COLUMN "university",
  DROP COLUMN "year";
ALTER TABLE "person_education_history" RENAME COLUMN "degree_new" TO "degree";
ALTER TABLE "person_education_history"
  ADD CONSTRAINT "person_education_history_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "person_education_history_meaningful" CHECK ("degree" IS NOT NULL OR "universityId" IS NOT NULL OR NULLIF(BTRIM("universityNameSnapshot"), '') IS NOT NULL OR "educationDate" IS NOT NULL OR NULLIF(BTRIM("description"), '') IS NOT NULL);
CREATE INDEX "person_education_history_universityId_idx" ON "person_education_history"("universityId");
