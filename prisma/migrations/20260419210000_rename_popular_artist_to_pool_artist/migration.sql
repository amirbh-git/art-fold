-- Rename ingest-time artist column for use across all pool sources
ALTER TABLE "ArtPoolEntry" RENAME COLUMN "popularArtist" TO "poolArtist";
ALTER TABLE "ArtPoolArchive" RENAME COLUMN "popularArtist" TO "poolArtist";

DROP INDEX IF EXISTS "ArtPoolEntry_popularArtist_idx";
DROP INDEX IF EXISTS "ArtPoolArchive_popularArtist_idx";

CREATE INDEX "ArtPoolEntry_poolArtist_idx" ON "ArtPoolEntry"("poolArtist");
CREATE INDEX "ArtPoolArchive_poolArtist_idx" ON "ArtPoolArchive"("poolArtist");
