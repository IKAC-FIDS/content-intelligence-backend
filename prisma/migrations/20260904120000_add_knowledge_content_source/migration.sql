CREATE TYPE "KnowledgeContentType" AS ENUM ('ARTICLE', 'EXTERNAL_LINK');

ALTER TABLE "knowledge_base_articles"
  ALTER COLUMN "content" DROP NOT NULL,
  ADD COLUMN "contentType" "KnowledgeContentType" NOT NULL DEFAULT 'ARTICLE',
  ADD COLUMN "externalUrl" TEXT;
