/*
  Warnings:

  - You are about to drop the column `isssueDate` on the `Certificate` table. All the data in the column will be lost.
  - Changed the type of `price` on the `Artwork` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Added the required column `issueDate` to the `Certificate` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Artwork" DROP COLUMN "price",
ADD COLUMN     "price" DECIMAL(65,30) NOT NULL;

-- AlterTable
ALTER TABLE "Certificate" DROP COLUMN "isssueDate",
ADD COLUMN     "issueDate" TIMESTAMP(3) NOT NULL;

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE INDEX "Artwork_ownerId_idx" ON "Artwork"("ownerId");

-- CreateIndex
CREATE INDEX "Invoice_buyerId_idx" ON "Invoice"("buyerId");

-- CreateIndex
CREATE INDEX "Invoice_artworkId_idx" ON "Invoice"("artworkId");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
