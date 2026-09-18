ALTER TABLE "companies"
  ADD COLUMN "logoStorageProvider" "AttachmentStorageProvider",
  ADD COLUMN "logoBucket" TEXT,
  ADD COLUMN "logoObjectKey" TEXT,
  ADD COLUMN "logoStoragePath" TEXT,
  ADD COLUMN "logoMimeType" TEXT,
  ADD COLUMN "logoOriginalName" TEXT;

ALTER TABLE "users"
  ADD COLUMN "avatarStorageProvider" "AttachmentStorageProvider",
  ADD COLUMN "avatarBucket" TEXT,
  ADD COLUMN "avatarObjectKey" TEXT,
  ADD COLUMN "avatarStoragePath" TEXT,
  ADD COLUMN "avatarMimeType" TEXT,
  ADD COLUMN "avatarOriginalName" TEXT;
