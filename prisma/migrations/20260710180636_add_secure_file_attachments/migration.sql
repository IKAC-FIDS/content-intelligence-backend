CREATE TYPE "FileAttachmentEntityType" AS ENUM (
  'OPPORTUNITY',
  'COMMERCIAL_DOCUMENT',
  'PAYMENT'
);

CREATE TYPE "AttachmentStorageProvider" AS ENUM (
  'LOCAL',
  'MINIO'
);

CREATE TABLE "file_attachments" (
                                    "id" TEXT NOT NULL,
                                    "entityType" "FileAttachmentEntityType" NOT NULL,
                                    "entityId" TEXT NOT NULL,

                                    "storageProvider" "AttachmentStorageProvider" NOT NULL DEFAULT 'LOCAL',

                                    "bucket" TEXT,
                                    "objectKey" TEXT NOT NULL,
                                    "storagePath" TEXT,

                                    "originalFileName" TEXT NOT NULL,
                                    "storedFileName" TEXT NOT NULL,

                                    "mimeType" TEXT NOT NULL,
                                    "sizeBytes" INTEGER NOT NULL,
                                    "sha256" TEXT NOT NULL,

                                    "description" TEXT,

                                    "uploadedById" TEXT,
                                    "deletedAt" TIMESTAMP(3),
                                    "deletedById" TEXT,

                                    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                    "updatedAt" TIMESTAMP(3) NOT NULL,

                                    CONSTRAINT "file_attachments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "file_attachments_entityType_entityId_idx" ON "file_attachments"("entityType", "entityId");
CREATE INDEX "file_attachments_storageProvider_idx" ON "file_attachments"("storageProvider");
CREATE INDEX "file_attachments_bucket_idx" ON "file_attachments"("bucket");
CREATE INDEX "file_attachments_objectKey_idx" ON "file_attachments"("objectKey");
CREATE INDEX "file_attachments_uploadedById_idx" ON "file_attachments"("uploadedById");
CREATE INDEX "file_attachments_sha256_idx" ON "file_attachments"("sha256");
CREATE INDEX "file_attachments_deletedAt_idx" ON "file_attachments"("deletedAt");