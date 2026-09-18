-- Add request-context columns to audit logs
ALTER TABLE "audit_logs" ADD COLUMN "requestId" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN "ipAddress" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN "userAgent" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN "requestMethod" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN "requestPath" TEXT;

-- Indexes for audit investigation and correlation
CREATE INDEX "audit_logs_requestId_idx" ON "audit_logs"("requestId");
CREATE INDEX "audit_logs_ipAddress_idx" ON "audit_logs"("ipAddress");
CREATE INDEX "audit_logs_requestMethod_idx" ON "audit_logs"("requestMethod");