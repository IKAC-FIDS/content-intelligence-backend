CREATE TYPE "ConversationEntityType" AS ENUM ('COMPANY', 'TASK', 'ACTIVITY');
CREATE TYPE "ConversationMessageType" AS ENUM ('COMMENT', 'QUESTION', 'ANSWER');
CREATE TYPE "ConversationThreadStatus" AS ENUM ('OPEN', 'RESOLVED');

CREATE TABLE "conversation_threads" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "entityType" "ConversationEntityType" NOT NULL,
  "entityId" TEXT NOT NULL,
  "status" "ConversationThreadStatus" NOT NULL DEFAULT 'OPEN',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "conversation_threads_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "conversation_messages" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "threadId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "parentMessageId" TEXT,
  "type" "ConversationMessageType" NOT NULL DEFAULT 'COMMENT',
  "body" TEXT NOT NULL,
  "editedAt" TIMESTAMP(3),
  "deletedAt" TIMESTAMP(3),
  "deletedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "conversation_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "conversation_participants" (
  "threadId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "lastReadAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "conversation_participants_pkey" PRIMARY KEY ("threadId", "userId")
);

CREATE UNIQUE INDEX "conversation_threads_organizationId_entityType_entityId_key" ON "conversation_threads"("organizationId", "entityType", "entityId");
CREATE INDEX "conversation_threads_organizationId_status_updatedAt_idx" ON "conversation_threads"("organizationId", "status", "updatedAt");
CREATE INDEX "conversation_threads_createdById_idx" ON "conversation_threads"("createdById");
CREATE INDEX "conversation_messages_organizationId_threadId_createdAt_idx" ON "conversation_messages"("organizationId", "threadId", "createdAt");
CREATE INDEX "conversation_messages_parentMessageId_idx" ON "conversation_messages"("parentMessageId");
CREATE INDEX "conversation_messages_authorId_idx" ON "conversation_messages"("authorId");
CREATE INDEX "conversation_participants_userId_lastReadAt_idx" ON "conversation_participants"("userId", "lastReadAt");

ALTER TABLE "conversation_threads" ADD CONSTRAINT "conversation_threads_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversation_threads" ADD CONSTRAINT "conversation_threads_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "conversation_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_parentMessageId_fkey" FOREIGN KEY ("parentMessageId") REFERENCES "conversation_messages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "conversation_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "conversation_threads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "conversation_threads" FORCE ROW LEVEL SECURITY;
CREATE POLICY "conversation_threads_tenant_isolation" ON "conversation_threads"
  USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''))
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''));

ALTER TABLE "conversation_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "conversation_messages" FORCE ROW LEVEL SECURITY;
CREATE POLICY "conversation_messages_tenant_isolation" ON "conversation_messages"
  USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''))
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''));

ALTER TABLE "conversation_participants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "conversation_participants" FORCE ROW LEVEL SECURITY;
CREATE POLICY "conversation_participants_tenant_isolation" ON "conversation_participants"
  USING (EXISTS (
    SELECT 1 FROM "conversation_threads" t
    WHERE t."id" = "conversation_participants"."threadId"
      AND t."organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "conversation_threads" t
    WHERE t."id" = "conversation_participants"."threadId"
      AND t."organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')
  ));
