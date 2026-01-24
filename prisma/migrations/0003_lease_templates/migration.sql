-- CreateTable
CREATE TABLE "LeaseTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "description" TEXT,
    "jurisdiction" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaseTemplate_pkey" PRIMARY KEY ("id")
);

-- AlterTable: Add templateId, rentAmount, xodoSignDocumentId to Lease
ALTER TABLE "Lease" ADD COLUMN "templateId" TEXT;
ALTER TABLE "Lease" ADD COLUMN "rentAmount" DOUBLE PRECISION;
ALTER TABLE "Lease" ADD COLUMN "xodoSignDocumentId" TEXT;

-- CreateIndex
CREATE INDEX "Lease_templateId_idx" ON "Lease"("templateId");

-- AddForeignKey
ALTER TABLE "Lease" ADD CONSTRAINT "Lease_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "LeaseTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
