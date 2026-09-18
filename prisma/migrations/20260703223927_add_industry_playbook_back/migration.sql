-- CreateTable
CREATE TABLE "industry_playbook" (
    "id" TEXT NOT NULL,
    "industryTag" TEXT NOT NULL,
    "defaultPainPoint" TEXT,
    "defaultUseCase" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "industry_playbook_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "industry_playbook_industryTag_idx" ON "industry_playbook"("industryTag");
