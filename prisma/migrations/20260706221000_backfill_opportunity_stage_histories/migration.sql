-- Preserve legacy company pipeline history on each phase-1 default opportunity.
DELETE FROM "opportunity_stage_histories" osh
USING "opportunities" o
WHERE osh."opportunityId" = o."id"
  AND o."title" = 'Primary sales opportunity'
  AND EXISTS (
    SELECT 1 FROM "pipeline_stage_history" psh WHERE psh."companyId" = o."companyId"
  );

INSERT INTO "opportunity_stage_histories" (
  "id", "opportunityId", "fromStage", "toStage", "changedById", "changedAt"
)
SELECT
  gen_random_uuid()::text,
  o."id",
  psh."fromStage",
  psh."toStage",
  psh."changedById",
  psh."changedAt"
FROM "pipeline_stage_history" psh
JOIN "opportunities" o
  ON o."companyId" = psh."companyId"
 AND o."title" = 'Primary sales opportunity';
