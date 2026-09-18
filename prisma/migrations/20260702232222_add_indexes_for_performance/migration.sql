-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'MANAGER', 'REP');

-- CreateEnum
CREATE TYPE "PipelineStage" AS ENUM ('LEAD', 'CONTACTED', 'INTERESTED', 'QUALIFIED', 'NEEDS_ASSESSMENT', 'PENDING_PRE_INVOICE_APPROVAL', 'POC_PILOT_SCHEDULED', 'POC_PILOT_IN_PROGRESS', 'PENDING_POC_PILOT_APPROVAL', 'PENDING_PAYMENT_INVOICE_APPROVAL', 'INSTALLATION_SCHEDULED', 'INSTALLATION_IN_PROGRESS', 'PENDING_CUSTOMER_ACCEPTANCE', 'DONE', 'ON_HOLD', 'LOST', 'NO_RESPONSE');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'STRATEGIC');

-- CreateEnum
CREATE TYPE "CompanyOwnership" AS ENUM ('PRIVATE', 'STATE', 'SEMI_STATE', 'PUBLIC_LISTED', 'BANK', 'HOLDING');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('CALL', 'EMAIL', 'LINKEDIN_MESSAGE', 'LINKEDIN_ENGAGEMENT', 'MEETING', 'NOTE', 'STAGE_CHANGE');

-- CreateEnum
CREATE TYPE "SocialPlatform" AS ENUM ('LINKEDIN', 'INSTAGRAM', 'TELEGRAM', 'BALE', 'EITAA', 'SOROUSH', 'ROOBIKA', 'APARAT', 'YOUTUBE', 'WEBSITE');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'REP',
    "team" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "leadCode" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "brandName" TEXT,
    "registrationNo" TEXT,
    "nationalId" TEXT,
    "economicCode" TEXT,
    "foundedYear" INTEGER,
    "companyType" TEXT,
    "ownership" "CompanyOwnership",
    "activityStatus" TEXT,
    "activityGroup" TEXT,
    "marketSize" TEXT,
    "industry" TEXT,
    "parentCompanyId" TEXT,
    "website" TEXT,
    "publicEmail" TEXT,
    "headOfficeProvince" TEXT,
    "headOfficeCity" TEXT,
    "headOfficeAddress" TEXT,
    "postalCode" TEXT,
    "centralPhone" TEXT,
    "registeredCapital" BIGINT,
    "employeeCount" INTEGER,
    "annualRevenue" BIGINT,
    "ownerId" TEXT,
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "stage" "PipelineStage" NOT NULL DEFAULT 'LEAD',
    "source" TEXT DEFAULT 'SAM_LIST',
    "nextActionDate" TIMESTAMP(3),
    "researchCompletion" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_branches" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT,
    "city" TEXT,
    "address" TEXT,
    "phone" TEXT,

    CONSTRAINT "company_branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_social_channels" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "platform" "SocialPlatform" NOT NULL,
    "handle" TEXT NOT NULL,

    CONSTRAINT "company_social_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "people" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "title" TEXT,
    "department" TEXT,
    "seniorityLevel" TEXT,
    "personaTag" TEXT,
    "tenureInRole" TEXT,
    "expertiseArea" TEXT,
    "linkedinUrl" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "linkedinActive" BOOLEAN,
    "bestChannel" TEXT,
    "isPrimaryContact" BOOLEAN NOT NULL DEFAULT false,
    "isSecondaryContact" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "people_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activities" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "personId" TEXT,
    "userId" TEXT NOT NULL,
    "type" "ActivityType" NOT NULL,
    "notes" TEXT,
    "outcome" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nextActionDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pipeline_stage_history" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "fromStage" "PipelineStage",
    "toStage" "PipelineStage" NOT NULL,
    "changedById" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pipeline_stage_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_cards" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "primaryContactId" TEXT,
    "secondaryContactId" TEXT,
    "entryAngle" TEXT,
    "painPoint" TEXT,
    "useCase" TEXT,
    "openingLine" TEXT,
    "firstEmail" TEXT,
    "linkedinMsg" TEXT,
    "discoveryQs" JSONB,
    "objections" JSONB,
    "meetingAsk" TEXT,
    "callGoal" TEXT,
    "followUpNoResponseAt" TEXT,
    "followUpInterestAt" TEXT,
    "qualificationCriteria" TEXT,
    "disqualificationCriteria" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "call_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "persona_library" (
    "id" TEXT NOT NULL,
    "titlePattern" TEXT NOT NULL,
    "defaultPainPoint" TEXT,
    "defaultUseCase" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "persona_library_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "industry_playbook" (
    "id" TEXT NOT NULL,
    "industryTag" TEXT NOT NULL,
    "defaultPainPoint" TEXT,
    "defaultUseCase" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "industry_playbook_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "companies_leadCode_key" ON "companies"("leadCode");

-- CreateIndex
CREATE INDEX "companies_ownerId_idx" ON "companies"("ownerId");

-- CreateIndex
CREATE INDEX "companies_stage_idx" ON "companies"("stage");

-- CreateIndex
CREATE INDEX "companies_priority_idx" ON "companies"("priority");

-- CreateIndex
CREATE INDEX "companies_industry_idx" ON "companies"("industry");

-- CreateIndex
CREATE INDEX "companies_createdAt_idx" ON "companies"("createdAt");

-- CreateIndex
CREATE INDEX "companies_updatedAt_idx" ON "companies"("updatedAt");

-- CreateIndex
CREATE INDEX "companies_ownerId_stage_idx" ON "companies"("ownerId", "stage");

-- CreateIndex
CREATE INDEX "companies_stage_priority_idx" ON "companies"("stage", "priority");

-- CreateIndex
CREATE INDEX "company_branches_companyId_idx" ON "company_branches"("companyId");

-- CreateIndex
CREATE INDEX "company_social_channels_companyId_idx" ON "company_social_channels"("companyId");

-- CreateIndex
CREATE INDEX "company_social_channels_platform_idx" ON "company_social_channels"("platform");

-- CreateIndex
CREATE INDEX "people_companyId_idx" ON "people"("companyId");

-- CreateIndex
CREATE INDEX "people_personaTag_idx" ON "people"("personaTag");

-- CreateIndex
CREATE INDEX "people_isPrimaryContact_idx" ON "people"("isPrimaryContact");

-- CreateIndex
CREATE INDEX "activities_companyId_idx" ON "activities"("companyId");

-- CreateIndex
CREATE INDEX "activities_userId_idx" ON "activities"("userId");

-- CreateIndex
CREATE INDEX "activities_nextActionDate_idx" ON "activities"("nextActionDate");

-- CreateIndex
CREATE INDEX "activities_type_idx" ON "activities"("type");

-- CreateIndex
CREATE INDEX "activities_occurredAt_idx" ON "activities"("occurredAt");

-- CreateIndex
CREATE INDEX "activities_userId_nextActionDate_idx" ON "activities"("userId", "nextActionDate");

-- CreateIndex
CREATE INDEX "activities_companyId_occurredAt_idx" ON "activities"("companyId", "occurredAt");

-- CreateIndex
CREATE INDEX "pipeline_stage_history_companyId_idx" ON "pipeline_stage_history"("companyId");

-- CreateIndex
CREATE INDEX "pipeline_stage_history_changedAt_idx" ON "pipeline_stage_history"("changedAt");

-- CreateIndex
CREATE INDEX "pipeline_stage_history_toStage_idx" ON "pipeline_stage_history"("toStage");

-- CreateIndex
CREATE INDEX "pipeline_stage_history_companyId_changedAt_idx" ON "pipeline_stage_history"("companyId", "changedAt");

-- CreateIndex
CREATE UNIQUE INDEX "call_cards_companyId_key" ON "call_cards"("companyId");

-- CreateIndex
CREATE INDEX "call_cards_primaryContactId_idx" ON "call_cards"("primaryContactId");

-- CreateIndex
CREATE INDEX "call_cards_secondaryContactId_idx" ON "call_cards"("secondaryContactId");

-- CreateIndex
CREATE INDEX "persona_library_titlePattern_idx" ON "persona_library"("titlePattern");

-- CreateIndex
CREATE INDEX "industry_playbook_industryTag_idx" ON "industry_playbook"("industryTag");

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_parentCompanyId_fkey" FOREIGN KEY ("parentCompanyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_branches" ADD CONSTRAINT "company_branches_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_social_channels" ADD CONSTRAINT "company_social_channels_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "people" ADD CONSTRAINT "people_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_stage_history" ADD CONSTRAINT "pipeline_stage_history_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_stage_history" ADD CONSTRAINT "pipeline_stage_history_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_cards" ADD CONSTRAINT "call_cards_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
