/**
 * Replaces ArtPoolEntry with the snapshot in ArtPoolArchive.
 * `npm run art-pool:restore-from-archive`
 */

import { config as loadEnv } from "dotenv";
loadEnv();
loadEnv({ path: ".env.local" });

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const n = await prisma.artPoolArchive.count();
  if (n === 0) {
    console.error("ArtPoolArchive is empty. Run npm run art-pool:archive-full first.");
    process.exitCode = 1;
    return;
  }

  console.log(`Restoring ${n.toLocaleString()} rows from ArtPoolArchive → ArtPoolEntry…`);

  await prisma.$executeRawUnsafe(`TRUNCATE "ArtPoolEntry"`);

  await prisma.$executeRaw`
    INSERT INTO "ArtPoolEntry" ("id", "source", "objectId", "poolArtist", "createdAt")
    SELECT "id", "source", "objectId", "poolArtist", "createdAt" FROM "ArtPoolArchive"
  `;

  const restored = await prisma.artPoolEntry.count();
  console.log(`ArtPoolEntry now has ${restored.toLocaleString()} rows.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
