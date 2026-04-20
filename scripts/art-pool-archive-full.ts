/**
 * Copies every row from ArtPoolEntry → ArtPoolArchive (full snapshot).
 * Run before capping: `npm run art-pool:archive-full`
 * Requires migration `ArtPoolArchive` applied (`npx prisma migrate deploy`).
 */

import { config as loadEnv } from "dotenv";
loadEnv();
loadEnv({ path: ".env.local" });

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const n = await prisma.artPoolEntry.count();
  console.log(`Copying ${n.toLocaleString()} rows from ArtPoolEntry → ArtPoolArchive…`);

  await prisma.$executeRawUnsafe(`TRUNCATE "ArtPoolArchive"`);

  await prisma.$executeRaw`
    INSERT INTO "ArtPoolArchive" ("id", "source", "objectId", "poolArtist", "createdAt")
    SELECT "id", "source", "objectId", "poolArtist", "createdAt" FROM "ArtPoolEntry"
  `;

  const archived = await prisma.artPoolArchive.count();
  console.log(`ArtPoolArchive now has ${archived.toLocaleString()} rows (full snapshot).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
