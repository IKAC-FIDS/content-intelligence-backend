-- fix 000088: additive Platform authority source of truth.
-- No existing User is granted Platform authority by this migration.

CREATE TYPE "PlatformRole" AS ENUM ('PLATFORM_ADMIN');

CREATE TABLE "platform_authorities" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "PlatformRole" NOT NULL DEFAULT 'PLATFORM_ADMIN',
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_authorities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "platform_authorities_userId_key"
ON "platform_authorities"("userId");

CREATE INDEX "platform_authorities_role_idx"
ON "platform_authorities"("role");

ALTER TABLE "platform_authorities"
ADD CONSTRAINT "platform_authorities_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
