/*
  Warnings:

  - You are about to drop the `industry_playbook` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "industry_playbook";

-- CreateTable
CREATE TABLE "industries" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "industries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pain_points" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pain_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "use_cases" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "use_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "industry_pain_points" (
    "id" TEXT NOT NULL,
    "industryId" TEXT NOT NULL,
    "painPointId" TEXT NOT NULL,
    "priority" INTEGER DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "industry_pain_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "industry_use_cases" (
    "id" TEXT NOT NULL,
    "industryId" TEXT NOT NULL,
    "useCaseId" TEXT NOT NULL,
    "priority" INTEGER DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "industry_use_cases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "industries_name_key" ON "industries"("name");

-- CreateIndex
CREATE INDEX "industry_pain_points_industryId_idx" ON "industry_pain_points"("industryId");

-- CreateIndex
CREATE INDEX "industry_pain_points_painPointId_idx" ON "industry_pain_points"("painPointId");

-- CreateIndex
CREATE UNIQUE INDEX "industry_pain_points_industryId_painPointId_key" ON "industry_pain_points"("industryId", "painPointId");

-- CreateIndex
CREATE INDEX "industry_use_cases_industryId_idx" ON "industry_use_cases"("industryId");

-- CreateIndex
CREATE INDEX "industry_use_cases_useCaseId_idx" ON "industry_use_cases"("useCaseId");

-- CreateIndex
CREATE UNIQUE INDEX "industry_use_cases_industryId_useCaseId_key" ON "industry_use_cases"("industryId", "useCaseId");

-- AddForeignKey
ALTER TABLE "industry_pain_points" ADD CONSTRAINT "industry_pain_points_industryId_fkey" FOREIGN KEY ("industryId") REFERENCES "industries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "industry_pain_points" ADD CONSTRAINT "industry_pain_points_painPointId_fkey" FOREIGN KEY ("painPointId") REFERENCES "pain_points"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "industry_use_cases" ADD CONSTRAINT "industry_use_cases_industryId_fkey" FOREIGN KEY ("industryId") REFERENCES "industries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "industry_use_cases" ADD CONSTRAINT "industry_use_cases_useCaseId_fkey" FOREIGN KEY ("useCaseId") REFERENCES "use_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
