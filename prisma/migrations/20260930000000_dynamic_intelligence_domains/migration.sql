CREATE TABLE "intelligence_domains" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "intelligence_domains_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "workspace_domains" (
    "workspaceId" TEXT NOT NULL,
    "domainId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "workspace_domains_pkey" PRIMARY KEY ("workspaceId", "domainId")
);

CREATE UNIQUE INDEX "intelligence_domains_code_key" ON "intelligence_domains"("code");
CREATE INDEX "intelligence_domains_isActive_name_idx" ON "intelligence_domains"("isActive", "name");
CREATE INDEX "workspace_domains_domainId_idx" ON "workspace_domains"("domainId");

ALTER TABLE "workspace_domains" ADD CONSTRAINT "workspace_domains_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workspace_domains" ADD CONSTRAINT "workspace_domains_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "intelligence_domains"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
