/*
  Warnings:

  - You are about to drop the `Art` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Art";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "Artwork" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "price" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Certificate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "artworkId" TEXT NOT NULL,
    "isssueDate" DATETIME NOT NULL,
    "content" TEXT NOT NULL,
    CONSTRAINT "Certificate_artworkId_fkey" FOREIGN KEY ("artworkId") REFERENCES "Artwork" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "artworkId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "invoiceDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amount" DECIMAL NOT NULL,
    "status" TEXT NOT NULL,
    CONSTRAINT "Invoice_artworkId_fkey" FOREIGN KEY ("artworkId") REFERENCES "Artwork" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Invoice_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Certificate_artworkId_key" ON "Certificate"("artworkId");
