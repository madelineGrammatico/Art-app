/*
  Warnings:

  - You are about to drop the column `amount` on the `Invoice` table. All the data in the column will be lost.
  - You are about to drop the column `artworkId` on the `Invoice` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `Invoice` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[number]` on the table `Invoice` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[type,stripeSessionId]` on the table `Invoice` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[stripeRefundId]` on the table `Invoice` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `number` to the `Invoice` table without a default value. This is not possible if the table is not empty.
  - Added the required column `saleDate` to the `Invoice` table without a default value. This is not possible if the table is not empty.
  - Added the required column `sellerAddress` to the `Invoice` table without a default value. This is not possible if the table is not empty.
  - Added the required column `sellerLegalForm` to the `Invoice` table without a default value. This is not possible if the table is not empty.
  - Added the required column `sellerName` to the `Invoice` table without a default value. This is not possible if the table is not empty.
  - Added the required column `sellerSiret` to the `Invoice` table without a default value. This is not possible if the table is not empty.
  - Added the required column `totalHT` to the `Invoice` table without a default value. This is not possible if the table is not empty.
  - Added the required column `totalTTC` to the `Invoice` table without a default value. This is not possible if the table is not empty.
  - Added the required column `totalVat` to the `Invoice` table without a default value. This is not possible if the table is not empty.
  - Added the required column `vatRegime` to the `Invoice` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "InvoiceType" AS ENUM ('SALE', 'CREDIT_NOTE');

-- DropForeignKey
ALTER TABLE "Invoice" DROP CONSTRAINT "Invoice_artworkId_fkey";

-- DropIndex
DROP INDEX "Invoice_artworkId_idx";

-- DropIndex
DROP INDEX "Invoice_stripeSessionId_artworkId_key";

-- AlterTable
ALTER TABLE "Invoice" DROP COLUMN "amount",
DROP COLUMN "artworkId",
DROP COLUMN "status",
ADD COLUMN     "creditedInvoiceId" TEXT,
ADD COLUMN     "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "legalMention" TEXT,
ADD COLUMN     "number" TEXT NOT NULL,
ADD COLUMN     "saleDate" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "sellerAddress" TEXT NOT NULL,
ADD COLUMN     "sellerLegalForm" TEXT NOT NULL,
ADD COLUMN     "sellerName" TEXT NOT NULL,
ADD COLUMN     "sellerRcs" TEXT,
ADD COLUMN     "sellerSiret" TEXT NOT NULL,
ADD COLUMN     "sellerVatNumber" TEXT,
ADD COLUMN     "totalHT" DECIMAL(65,30) NOT NULL,
ADD COLUMN     "totalTTC" DECIMAL(65,30) NOT NULL,
ADD COLUMN     "totalVat" DECIMAL(65,30) NOT NULL,
ADD COLUMN     "type" "InvoiceType" NOT NULL DEFAULT 'SALE',
ADD COLUMN     "vatRegime" TEXT NOT NULL;

-- DropEnum
DROP TYPE "InvoiceStatus";

-- CreateTable
CREATE TABLE "Counter" (
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Counter_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "InvoiceLineItem" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "artworkId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "unitPriceHT" DECIMAL(65,30) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "vatRate" DECIMAL(65,30) NOT NULL,
    "vatAmount" DECIMAL(65,30) NOT NULL,
    "lineTTC" DECIMAL(65,30) NOT NULL,

    CONSTRAINT "InvoiceLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefundRecovery" (
    "id" TEXT NOT NULL,
    "stripeSessionId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "artworkId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "stripeRefundId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefundRecovery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InvoiceLineItem_artworkId_idx" ON "InvoiceLineItem"("artworkId");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceLineItem_invoiceId_artworkId_key" ON "InvoiceLineItem"("invoiceId", "artworkId");

-- CreateIndex
CREATE INDEX "RefundRecovery_stripeSessionId_idx" ON "RefundRecovery"("stripeSessionId");

-- CreateIndex
CREATE INDEX "RefundRecovery_buyerId_idx" ON "RefundRecovery"("buyerId");

-- CreateIndex
CREATE UNIQUE INDEX "RefundRecovery_stripeSessionId_artworkId_key" ON "RefundRecovery"("stripeSessionId", "artworkId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number");

-- CreateIndex
CREATE INDEX "Invoice_creditedInvoiceId_idx" ON "Invoice"("creditedInvoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_type_stripeSessionId_key" ON "Invoice"("type", "stripeSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_stripeRefundId_key" ON "Invoice"("stripeRefundId");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_creditedInvoiceId_fkey" FOREIGN KEY ("creditedInvoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLineItem" ADD CONSTRAINT "InvoiceLineItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLineItem" ADD CONSTRAINT "InvoiceLineItem_artworkId_fkey" FOREIGN KEY ("artworkId") REFERENCES "Artwork"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundRecovery" ADD CONSTRAINT "RefundRecovery_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundRecovery" ADD CONSTRAINT "RefundRecovery_artworkId_fkey" FOREIGN KEY ("artworkId") REFERENCES "Artwork"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
