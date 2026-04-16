-- CreateTable
CREATE TABLE "Exhibit" (
    "id" TEXT NOT NULL,
    "theme" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Exhibit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExhibitSlot" (
    "id" TEXT NOT NULL,
    "exhibitId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'met',
    "objectId" TEXT NOT NULL,
    "title" TEXT,
    "artist" TEXT,
    "imageUrl" TEXT,
    "objectUrl" TEXT,

    CONSTRAINT "ExhibitSlot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExhibitSlot_exhibitId_position_key" ON "ExhibitSlot"("exhibitId", "position");

-- AddForeignKey
ALTER TABLE "ExhibitSlot" ADD CONSTRAINT "ExhibitSlot_exhibitId_fkey" FOREIGN KEY ("exhibitId") REFERENCES "Exhibit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
