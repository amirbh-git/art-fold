-- AlterTable
ALTER TABLE "ArtPoolEntry" ADD COLUMN "popularArtist" TEXT;

-- AlterTable
ALTER TABLE "ArtPoolArchive" ADD COLUMN "popularArtist" TEXT;

-- CreateIndex
CREATE INDEX "ArtPoolEntry_popularArtist_idx" ON "ArtPoolEntry"("popularArtist");

-- CreateIndex
CREATE INDEX "ArtPoolArchive_popularArtist_idx" ON "ArtPoolArchive"("popularArtist");
