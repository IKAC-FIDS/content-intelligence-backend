CREATE TABLE "topics" (
  "id" TEXT NOT NULL, "code" TEXT NOT NULL, "name" TEXT NOT NULL, "description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "topics_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "topic_domains" (
  "topicId" TEXT NOT NULL, "domainId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "topic_domains_pkey" PRIMARY KEY ("topicId", "domainId")
);
CREATE TABLE "topic_aliases" (
  "id" TEXT NOT NULL, "topicId" TEXT NOT NULL, "value" TEXT NOT NULL, "normalizedValue" TEXT NOT NULL,
  "languageId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "topic_aliases_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "workspace_topics" (
  "workspaceId" TEXT NOT NULL, "topicId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "workspace_topics_pkey" PRIMARY KEY ("workspaceId", "topicId")
);
CREATE UNIQUE INDEX "topics_code_key" ON "topics"("code");
CREATE INDEX "topics_isActive_name_idx" ON "topics"("isActive", "name");
CREATE INDEX "topic_domains_domainId_idx" ON "topic_domains"("domainId");
CREATE UNIQUE INDEX "topic_aliases_topicId_normalizedValue_key" ON "topic_aliases"("topicId", "normalizedValue");
CREATE INDEX "topic_aliases_languageId_idx" ON "topic_aliases"("languageId");
CREATE INDEX "workspace_topics_topicId_idx" ON "workspace_topics"("topicId");
ALTER TABLE "topic_domains" ADD CONSTRAINT "topic_domains_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "topic_domains" ADD CONSTRAINT "topic_domains_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "intelligence_domains"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "topic_aliases" ADD CONSTRAINT "topic_aliases_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "topic_aliases" ADD CONSTRAINT "topic_aliases_languageId_fkey" FOREIGN KEY ("languageId") REFERENCES "languages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "workspace_topics" ADD CONSTRAINT "workspace_topics_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workspace_topics" ADD CONSTRAINT "workspace_topics_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "topics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
