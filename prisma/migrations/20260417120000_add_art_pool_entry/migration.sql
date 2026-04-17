-- CreateTable
CREATE TABLE "ArtPoolEntry" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "objectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArtPoolEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ArtPoolEntry_source_objectId_key" ON "ArtPoolEntry"("source", "objectId");

-- CreateIndex
CREATE INDEX "ArtPoolEntry_source_idx" ON "ArtPoolEntry"("source");
