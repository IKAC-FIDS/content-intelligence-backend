-- CreateTable
CREATE TABLE "person_contacts" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "person_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person_socials" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "person_socials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "person_contacts_personId_idx" ON "person_contacts"("personId");

-- CreateIndex
CREATE INDEX "person_contacts_type_idx" ON "person_contacts"("type");

-- CreateIndex
CREATE UNIQUE INDEX "person_contacts_personId_type_value_key" ON "person_contacts"("personId", "type", "value");

-- CreateIndex
CREATE INDEX "person_socials_personId_idx" ON "person_socials"("personId");

-- CreateIndex
CREATE INDEX "person_socials_platform_idx" ON "person_socials"("platform");

-- CreateIndex
CREATE UNIQUE INDEX "person_socials_personId_platform_handle_key" ON "person_socials"("personId", "platform", "handle");

-- AddForeignKey
ALTER TABLE "person_contacts" ADD CONSTRAINT "person_contacts_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_socials" ADD CONSTRAINT "person_socials_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;
