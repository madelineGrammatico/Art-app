-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN "stripeSessionId" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "stripePaymentIntentId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_stripeSessionId_key" ON "Invoice"("stripeSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_stripePaymentIntentId_key" ON "Invoice"("stripePaymentIntentId");

-- CreateIndex
CREATE INDEX "Invoice_stripeSessionId_idx" ON "Invoice"("stripeSessionId");
