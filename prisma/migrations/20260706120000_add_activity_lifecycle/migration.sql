-- AlterTable
ALTER TABLE "activities"
ADD COLUMN "completedAt" TIMESTAMP(3),
ADD COLUMN "completedById" TEXT,
ADD COLUMN "completionNote" TEXT;

-- CreateIndex
CREATE INDEX "activities_completedAt_idx" ON "activities"("completedAt");

-- AddForeignKey
ALTER TABLE "activities"
ADD CONSTRAINT "activities_completedById_fkey"
FOREIGN KEY ("completedById") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
