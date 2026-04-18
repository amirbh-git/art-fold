/**
 * For each museum (source) with more than ART_POOL_CAP_MAX rows, randomly reduces to that many.
 * Default ART_POOL_CAP_MAX=25000. Sources at or below the cap are unchanged.
 *
 * Run `npm run art-pool:archive-full` first if you want a full snapshot to restore later.
 *
 * Usage: npm run art-pool:cap
 * Optional: ART_POOL_CAP_MAX=20000 npm run art-pool:cap
 */

import { config as loadEnv } from "dotenv";
loadEnv();
loadEnv({ path: ".env.local" });

import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function parseMax(): number {
  const raw = process.env.ART_POOL_CAP_MAX?.trim();
  if (raw === undefined || raw === "") return 25_000;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return 25_000;
  return n;
}

async function main() {
  const max = parseMax();
  console.log(`Cap per source: ${max.toLocaleString()} rows (random sample kept for oversized sources).\n`);

  const heavy = await prisma.$queryRaw<Array<{ source: string; c: bigint }>>(
    Prisma.sql`
    SELECT source, COUNT(*)::bigint AS c
    FROM "ArtPoolEntry"
    GROUP BY source
    HAVING COUNT(*) > ${max}
    ORDER BY source
  `,
  );

  if (heavy.length === 0) {
    console.log("No source exceeds the cap; nothing to delete.");
    return;
  }

  for (const row of heavy) {
    const source = row.source;
    const before = Number(row.c);
    await prisma.$executeRaw`
      WITH keepers AS (
        SELECT id FROM "ArtPoolEntry"
        WHERE source = ${source}
        ORDER BY RANDOM()
        LIMIT ${max}
      )
      DELETE FROM "ArtPoolEntry" AS a
      WHERE a.source = ${source}
      AND NOT EXISTS (SELECT 1 FROM keepers k WHERE k.id = a.id)
    `;
    const after = await prisma.artPoolEntry.count({ where: { source } });
    console.log(
      `  ${source}: ${before.toLocaleString()} → ${after.toLocaleString()} (removed ${(before - after).toLocaleString()})`,
    );
  }

  const total = await prisma.artPoolEntry.count();
  console.log(`\nArtPoolEntry total rows now: ${total.toLocaleString()}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
