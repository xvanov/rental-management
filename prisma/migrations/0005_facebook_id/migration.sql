-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN "facebookId" TEXT;

-- CreateIndex
CREATE INDEX "Tenant_facebookId_idx" ON "Tenant"("facebookId");
