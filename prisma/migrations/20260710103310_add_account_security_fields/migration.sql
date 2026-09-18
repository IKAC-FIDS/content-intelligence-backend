-- DropForeignKey
ALTER TABLE "opportunity_stage_histories" DROP CONSTRAINT "opportunity_stage_histories_fromStageId_fkey";

-- DropForeignKey
ALTER TABLE "pipeline_stage_transitions" DROP CONSTRAINT "pipeline_stage_transitions_fromStageId_fkey";

-- AlterTable
ALTER TABLE "pipeline_stages" ALTER COLUMN "sortOrder" SET DEFAULT 0;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "lastLoginIp" TEXT,
ADD COLUMN     "lockedUntil" TIMESTAMP(3),
ADD COLUMN     "passwordChangedAt" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "opportunity_stage_histories" ADD CONSTRAINT "opportunity_stage_histories_fromStageId_fkey" FOREIGN KEY ("fromStageId") REFERENCES "pipeline_stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_stage_transitions" ADD CONSTRAINT "pipeline_stage_transitions_fromStageId_fkey" FOREIGN KEY ("fromStageId") REFERENCES "pipeline_stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
