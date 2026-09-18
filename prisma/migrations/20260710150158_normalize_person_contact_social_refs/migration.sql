-- Add normalized lookup reference columns
ALTER TABLE "person_contacts" ADD COLUMN "typeOptionId" TEXT;
ALTER TABLE "person_socials" ADD COLUMN "platformOptionId" TEXT;

-- Backfill contact type references from lookup_options(contact_types)
-- We intentionally do not rewrite legacy "type" here to avoid unique collisions.
UPDATE "person_contacts" pc
SET "typeOptionId" = lo."id"
    FROM "lookup_options" lo
WHERE pc."typeOptionId" IS NULL
  AND lo."group" = 'contact_types'
  AND lo."isActive" = true
  AND (
    upper(trim(pc."type")) = upper(trim(lo."code"))
   OR lower(trim(pc."type")) = lower(trim(lo."label"))
    );

-- Backfill social platform references from lookup_options(social_types)
-- We intentionally do not rewrite legacy "platform" here to avoid unique collisions.
UPDATE "person_socials" ps
SET "platformOptionId" = lo."id"
    FROM "lookup_options" lo
WHERE ps."platformOptionId" IS NULL
  AND lo."group" = 'social_types'
  AND lo."isActive" = true
  AND (
    upper(trim(ps."platform")) = upper(trim(lo."code"))
   OR lower(trim(ps."platform")) = lower(trim(lo."label"))
    );

-- Indexes
CREATE INDEX "person_contacts_typeOptionId_idx" ON "person_contacts"("typeOptionId");
CREATE INDEX "person_socials_platformOptionId_idx" ON "person_socials"("platformOptionId");

-- Foreign keys
ALTER TABLE "person_contacts"
    ADD CONSTRAINT "person_contacts_typeOptionId_fkey"
        FOREIGN KEY ("typeOptionId") REFERENCES "lookup_options"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "person_socials"
    ADD CONSTRAINT "person_socials_platformOptionId_fkey"
        FOREIGN KEY ("platformOptionId") REFERENCES "lookup_options"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;