-- Full snapshot of the art pool before capping or other experiments.
-- Restore with: npm run art-pool:restore-from-archive (see scripts).

CREATE TABLE "ArtPoolArchive" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "objectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArtPoolArchive_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ArtPoolArchive_source_objectId_key" ON "ArtPoolArchive"("source", "objectId");

CREATE INDEX "ArtPoolArchive_source_idx" ON "ArtPoolArchive"("source");
