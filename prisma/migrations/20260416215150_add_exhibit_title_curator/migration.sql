-- AlterTable
ALTER TABLE "Exhibit" ADD COLUMN     "curatorName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "exhibitTitle" TEXT NOT NULL DEFAULT '',
ALTER COLUMN "theme" SET DEFAULT '';
