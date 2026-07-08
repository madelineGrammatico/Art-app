-- AlterTable
ALTER TABLE "Artwork" ADD COLUMN     "packageHeightCm" DECIMAL(65,30),
ADD COLUMN     "packageLengthCm" DECIMAL(65,30),
ADD COLUMN     "packageWeightKg" DECIMAL(65,30),
ADD COLUMN     "packageWidthCm" DECIMAL(65,30);
