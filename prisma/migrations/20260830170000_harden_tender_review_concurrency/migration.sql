-- Deterministically close older duplicate pending rounds if the first workflow
-- migration was already live before this hardening migration is deployed.
WITH ranked_pending AS (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY "organizationId", "tenderId", "type"
    ORDER BY "createdAt" DESC, "id" DESC
  ) AS position
  FROM "tender_reviews"
  WHERE "status" = 'PENDING'
)
UPDATE "tender_reviews" AS review
SET "status" = 'CANCELLED',
    "reviewedAt" = COALESCE(review."reviewedAt", CURRENT_TIMESTAMP),
    "comment" = COALESCE(review."comment", 'Automatically cancelled while enforcing one pending review per type'),
    "updatedAt" = CURRENT_TIMESTAMP
FROM ranked_pending
WHERE review."id" = ranked_pending."id" AND ranked_pending.position > 1;

-- A tender may only have one pending review of each type. This partial index
-- preserves all decided review rounds while closing the concurrent-request race.
CREATE UNIQUE INDEX "tender_reviews_one_pending_per_type_idx"
ON "tender_reviews" ("organizationId", "tenderId", "type")
WHERE "status" = 'PENDING';
