-- CreateTable
CREATE TABLE "refresh_sessions" (
                                    "id" TEXT NOT NULL,
                                    "userId" TEXT NOT NULL,
                                    "refreshTokenHash" TEXT NOT NULL,
                                    "userAgent" TEXT,
                                    "ipAddress" TEXT,
                                    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                    "expiresAt" TIMESTAMP(3) NOT NULL,
                                    "revokedAt" TIMESTAMP(3),
                                    "revokedReason" TEXT,
                                    "replacedBySessionId" TEXT,

                                    CONSTRAINT "refresh_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "refresh_sessions_refreshTokenHash_key" ON "refresh_sessions"("refreshTokenHash");

-- CreateIndex
CREATE INDEX "refresh_sessions_userId_idx" ON "refresh_sessions"("userId");

-- CreateIndex
CREATE INDEX "refresh_sessions_expiresAt_idx" ON "refresh_sessions"("expiresAt");

-- CreateIndex
CREATE INDEX "refresh_sessions_revokedAt_idx" ON "refresh_sessions"("revokedAt");

-- CreateIndex
CREATE INDEX "refresh_sessions_userId_revokedAt_expiresAt_idx" ON "refresh_sessions"("userId", "revokedAt", "expiresAt");

-- AddForeignKey
ALTER TABLE "refresh_sessions"
    ADD CONSTRAINT "refresh_sessions_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "users"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;