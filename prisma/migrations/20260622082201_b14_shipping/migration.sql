/*
  Warnings:

  - A unique constraint covering the columns `[invoiceId,artworkId,type]` on the table `InvoiceLineItem` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "FulfillmentMode" AS ENUM ('DELIVERY', 'PICKUP');

-- CreateEnum
CREATE TYPE "InvoiceLineItemType" AS ENUM ('ARTWORK', 'SHIPPING');

-- DropIndex
DROP INDEX "InvoiceLineItem_invoiceId_artworkId_key";

-- AlterTable
ALTER TABLE "Artwork" ADD COLUMN     "heightCm" DECIMAL(65,30),
ADD COLUMN     "lengthCm" DECIMAL(65,30),
ADD COLUMN     "requiresSpecialistCarrier" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "weightKg" DECIMAL(65,30),
ADD COLUMN     "widthCm" DECIMAL(65,30);

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "fulfillmentMode" "FulfillmentMode" NOT NULL DEFAULT 'DELIVERY',
ADD COLUMN     "pickupEmailSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "InvoiceLineItem" ADD COLUMN     "shippingMethodId" TEXT,
ADD COLUMN     "shippingParcelFailedAt" TIMESTAMP(3),
ADD COLUMN     "shippingParcelId" TEXT,
ADD COLUMN     "type" "InvoiceLineItemType" NOT NULL DEFAULT 'ARTWORK';

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceLineItem_invoiceId_artworkId_type_key" ON "InvoiceLineItem"("invoiceId", "artworkId", "type");
