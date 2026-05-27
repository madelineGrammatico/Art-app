-- AlterEnum
ALTER TYPE "InvoiceStatus" ADD VALUE 'REFUNDED';

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_stripeSessionId_artworkId_key" ON "Invoice"("stripeSessionId", "artworkId");
