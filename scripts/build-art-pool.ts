/**
 * Fetches eligible object IDs from partner APIs and fills `ArtPoolEntry`.
 * Run from project root: `npm run art-pool:build`
 * Requires DATABASE_URL, optional HARVARD_ART_API_KEY for Harvard rows.
 */

import { config as loadEnv } from "dotenv";
loadEnv();
loadEnv({ path: ".env.local" });
import { PrismaClient } from "@prisma/client";
import { collectArticObjectIdsForPool } from "@/lib/art-sources/artic";
import { collectClevelandObjectIdsForPool } from "@/lib/art-sources/cleveland";
import { collectHarvardObjectIdsForPool } from "@/lib/art-sources/harvard";

const prisma = new PrismaClient();
const BATCH = 2_000;

async function insertIds(source: string, ids: string[]): Promise<void> {
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH);
    const result = await prisma.artPoolEntry.createMany({
      data: chunk.map((objectId) => ({ source, objectId })),
      skipDuplicates: true,
    });
    console.log(
      `  ${source}: inserted ${result.count} (batch ${Math.floor(i / BATCH) + 1})`,
    );
  }
}

async function main() {
  console.log("Deleting existing art pool rows…");
  const deleted = await prisma.artPoolEntry.deleteMany({});
  console.log(`  removed ${deleted.count} rows\n`);

  console.log("Art Institute of Chicago…");
  const articIds = await collectArticObjectIdsForPool();
  await insertIds(
    "artic",
    articIds.map(String),
  );
  console.log(`  unique AIC IDs collected: ${articIds.length}\n`);

  console.log("Cleveland Museum of Art…");
  const cleIds = await collectClevelandObjectIdsForPool();
  await insertIds(
    "cleveland",
    cleIds.map(String),
  );
  console.log(`  unique Cleveland IDs collected: ${cleIds.length}\n`);

  console.log("Harvard Art Museums…");
  const harvIds = await collectHarvardObjectIdsForPool();
  if (harvIds.length === 0) {
    console.log(
      "  skipped (set HARVARD_ART_API_KEY to include Harvard in the pool)\n",
    );
  } else {
    await insertIds(
      "harvard",
      harvIds.map(String),
    );
    console.log(`  unique Harvard IDs collected: ${harvIds.length}\n`);
  }

  const counts = await prisma.artPoolEntry.groupBy({
    by: ["source"],
    _count: { _all: true },
  });
  console.log("Final row counts by source:");
  for (const row of counts.sort((a, b) => a.source.localeCompare(b.source))) {
    console.log(`  ${row.source}: ${row._count._all}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
