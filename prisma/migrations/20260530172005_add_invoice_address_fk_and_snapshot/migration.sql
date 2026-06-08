-- AlterTable: add FK columns + snapshot columns for billing and shipping
-- addresses on Invoice. All nullable: existing invoices have no address,
-- and new invoices that lose their address FK (user deleted it) still keep
-- the snapshot as legal source of truth.
ALTER TABLE "Invoice" ADD COLUMN "billingAddressId" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "billingStreet" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "billingPostalCode" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "billingCity" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "billingCountry" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "shippingAddressId" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "shippingStreet" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "shippingPostalCode" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "shippingCity" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "shippingCountry" TEXT;

-- CreateIndex
CREATE INDEX "Invoice_billingAddressId_idx" ON "Invoice"("billingAddressId");
CREATE INDEX "Invoice_shippingAddressId_idx" ON "Invoice"("shippingAddressId");

-- AddForeignKey: SetNull so deleting an address does not orphan the invoice
-- (snapshot columns preserve the legal record).
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_billingAddressId_fkey" FOREIGN KEY ("billingAddressId") REFERENCES "PostalAddress"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_shippingAddressId_fkey" FOREIGN KEY ("shippingAddressId") REFERENCES "PostalAddress"("id") ON DELETE SET NULL ON UPDATE CASCADE;
