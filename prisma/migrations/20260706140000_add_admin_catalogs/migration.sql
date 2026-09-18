-- CreateTable
CREATE TABLE "lead_sources" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "lead_sources_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "lookup_options" (
  "id" TEXT NOT NULL,
  "group" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "lookup_options_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "lead_sources_code_key" ON "lead_sources"("code");
CREATE INDEX "lead_sources_isActive_sortOrder_idx" ON "lead_sources"("isActive", "sortOrder");
CREATE UNIQUE INDEX "lookup_options_group_code_key" ON "lookup_options"("group", "code");
CREATE INDEX "lookup_options_group_idx" ON "lookup_options"("group");
CREATE INDEX "lookup_options_group_isActive_sortOrder_idx" ON "lookup_options"("group", "isActive", "sortOrder");
