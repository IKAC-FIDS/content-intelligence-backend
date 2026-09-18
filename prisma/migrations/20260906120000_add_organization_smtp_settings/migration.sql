ALTER TABLE "organization_settings"
  ADD COLUMN "smtpEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "smtpHost" TEXT,
  ADD COLUMN "smtpPort" INTEGER,
  ADD COLUMN "smtpSecure" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "smtpUsername" TEXT,
  ADD COLUMN "smtpPasswordEnc" TEXT,
  ADD COLUMN "smtpFromEmail" TEXT,
  ADD COLUMN "smtpFromName" TEXT,
  ADD COLUMN "smtpReplyTo" TEXT;
