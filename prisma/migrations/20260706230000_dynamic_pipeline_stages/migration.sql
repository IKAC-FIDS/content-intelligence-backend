-- Evolve the existing config table into the canonical dynamic stage table.
ALTER TABLE "pipeline_stage_configs" RENAME TO "pipeline_stages";
ALTER TABLE "pipeline_stages" RENAME CONSTRAINT "pipeline_stage_configs_pkey" TO "pipeline_stages_pkey";
DROP INDEX "pipeline_stage_configs_stage_key";
DROP INDEX "pipeline_stage_configs_isActive_sortOrder_idx";
ALTER TABLE "pipeline_stages" RENAME COLUMN "stage" TO "code";
ALTER TABLE "pipeline_stages" ALTER COLUMN "code" TYPE TEXT USING "code"::text;
ALTER TABLE "pipeline_stages" ADD COLUMN "terminalType" TEXT;
ALTER TABLE "pipeline_stages" ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false;

UPDATE "pipeline_stages"
SET "terminalType" = CASE
  WHEN "code" = 'DONE' THEN 'WON'
  WHEN "code" IN ('LOST', 'NO_RESPONSE') THEN 'LOST'
  WHEN "code" = 'ON_HOLD' THEN 'ON_HOLD'
  ELSE 'NONE'
END;
UPDATE "pipeline_stages" SET "isDefault" = true WHERE "code" = 'LEAD';

CREATE UNIQUE INDEX "pipeline_stages_code_key" ON "pipeline_stages"("code");
CREATE UNIQUE INDEX "pipeline_stages_one_default_key" ON "pipeline_stages"("isDefault") WHERE "isDefault" = true;
CREATE INDEX "pipeline_stages_sortOrder_idx" ON "pipeline_stages"("sortOrder");
CREATE INDEX "pipeline_stages_isActive_sortOrder_idx" ON "pipeline_stages"("isActive", "sortOrder");

-- Move transition rules from enum values to stage IDs.
ALTER TABLE "pipeline_stage_transitions" ADD COLUMN "fromStageId" TEXT;
ALTER TABLE "pipeline_stage_transitions" ADD COLUMN "toStageId" TEXT;
UPDATE "pipeline_stage_transitions" t
SET "fromStageId" = s."id"
FROM "pipeline_stages" s
WHERE t."fromStage"::text = s."code";
UPDATE "pipeline_stage_transitions" t
SET "toStageId" = s."id"
FROM "pipeline_stages" s
WHERE t."toStage"::text = s."code";
ALTER TABLE "pipeline_stage_transitions" ALTER COLUMN "toStageId" SET NOT NULL;
DROP INDEX "pipeline_stage_transitions_fromStage_toStage_role_key";
DROP INDEX "pipeline_stage_transitions_fromStage_toStage_idx";
ALTER TABLE "pipeline_stage_transitions" DROP COLUMN "fromStage";
ALTER TABLE "pipeline_stage_transitions" DROP COLUMN "toStage";
CREATE UNIQUE INDEX "pipeline_stage_transitions_fromStageId_toStageId_role_key" ON "pipeline_stage_transitions"("fromStageId", "toStageId", "role") NULLS NOT DISTINCT;
CREATE INDEX "pipeline_stage_transitions_fromStageId_idx" ON "pipeline_stage_transitions"("fromStageId");
CREATE INDEX "pipeline_stage_transitions_toStageId_idx" ON "pipeline_stage_transitions"("toStageId");
CREATE INDEX "pipeline_stage_transitions_role_idx" ON "pipeline_stage_transitions"("role");
ALTER TABLE "pipeline_stage_transitions" ADD CONSTRAINT "pipeline_stage_transitions_fromStageId_fkey" FOREIGN KEY ("fromStageId") REFERENCES "pipeline_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pipeline_stage_transitions" ADD CONSTRAINT "pipeline_stage_transitions_toStageId_fkey" FOREIGN KEY ("toStageId") REFERENCES "pipeline_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Move opportunities and their history to stage IDs.
ALTER TABLE "opportunities" ADD COLUMN "stageId" TEXT;
UPDATE "opportunities" o SET "stageId" = s."id" FROM "pipeline_stages" s WHERE o."stage"::text = s."code";
ALTER TABLE "opportunities" ALTER COLUMN "stageId" SET NOT NULL;
DROP INDEX "opportunities_stage_idx";
DROP INDEX "opportunities_ownerId_stage_idx";
ALTER TABLE "opportunities" DROP COLUMN "stage";
CREATE INDEX "opportunities_stageId_idx" ON "opportunities"("stageId");
CREATE INDEX "opportunities_ownerId_stageId_idx" ON "opportunities"("ownerId", "stageId");
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "pipeline_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "opportunity_stage_histories" ADD COLUMN "fromStageId" TEXT;
ALTER TABLE "opportunity_stage_histories" ADD COLUMN "toStageId" TEXT;
UPDATE "opportunity_stage_histories" h SET "fromStageId" = s."id" FROM "pipeline_stages" s WHERE h."fromStage"::text = s."code";
UPDATE "opportunity_stage_histories" h SET "toStageId" = s."id" FROM "pipeline_stages" s WHERE h."toStage"::text = s."code";
ALTER TABLE "opportunity_stage_histories" ALTER COLUMN "toStageId" SET NOT NULL;
DROP INDEX "opportunity_stage_histories_toStage_idx";
ALTER TABLE "opportunity_stage_histories" DROP COLUMN "fromStage";
ALTER TABLE "opportunity_stage_histories" DROP COLUMN "toStage";
CREATE INDEX "opportunity_stage_histories_fromStageId_idx" ON "opportunity_stage_histories"("fromStageId");
CREATE INDEX "opportunity_stage_histories_toStageId_idx" ON "opportunity_stage_histories"("toStageId");
ALTER TABLE "opportunity_stage_histories" ADD CONSTRAINT "opportunity_stage_histories_fromStageId_fkey" FOREIGN KEY ("fromStageId") REFERENCES "pipeline_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "opportunity_stage_histories" ADD CONSTRAINT "opportunity_stage_histories_toStageId_fkey" FOREIGN KEY ("toStageId") REFERENCES "pipeline_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
