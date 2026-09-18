-- CreateTable
CREATE TABLE "pipeline_stage_configs" (
  "id" TEXT NOT NULL,
  "stage" "PipelineStage" NOT NULL,
  "label" TEXT NOT NULL,
  "description" TEXT,
  "sortOrder" INTEGER NOT NULL,
  "color" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "isTerminal" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "pipeline_stage_configs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pipeline_stage_transitions" (
  "id" TEXT NOT NULL,
  "fromStage" "PipelineStage",
  "toStage" "PipelineStage" NOT NULL,
  "role" "UserRole",
  "isAllowed" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "pipeline_stage_transitions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pipeline_stage_configs_stage_key" ON "pipeline_stage_configs"("stage");
CREATE INDEX "pipeline_stage_configs_isActive_sortOrder_idx" ON "pipeline_stage_configs"("isActive", "sortOrder");
CREATE UNIQUE INDEX "pipeline_stage_transitions_fromStage_toStage_role_key" ON "pipeline_stage_transitions"("fromStage", "toStage", "role") NULLS NOT DISTINCT;
CREATE INDEX "pipeline_stage_transitions_fromStage_toStage_idx" ON "pipeline_stage_transitions"("fromStage", "toStage");
