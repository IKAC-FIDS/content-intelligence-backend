CREATE TABLE "organization_membership_teams" (
    "membershipId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_membership_teams_pkey" PRIMARY KEY ("membershipId", "teamId")
);

CREATE INDEX "organization_membership_teams_teamId_idx"
ON "organization_membership_teams"("teamId");

ALTER TABLE "organization_membership_teams"
ADD CONSTRAINT "organization_membership_teams_membershipId_fkey"
FOREIGN KEY ("membershipId") REFERENCES "organization_memberships"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "organization_membership_teams"
ADD CONSTRAINT "organization_membership_teams_teamId_fkey"
FOREIGN KEY ("teamId") REFERENCES "teams"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "organization_membership_teams" ("membershipId", "teamId")
SELECT membership."id", membership."teamId"
FROM "organization_memberships" AS membership
INNER JOIN "teams" AS team ON team."id" = membership."teamId"
WHERE membership."teamId" IS NOT NULL
  AND team."organizationId" = membership."organizationId"
ON CONFLICT DO NOTHING;
