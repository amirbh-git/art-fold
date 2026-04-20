/**
 * Prints row counts per `poolArtist` (ingest-time display string).
 *
 * Usage:
 *   npx tsx scripts/count-popular-pool-by-artist.ts
 *   npx tsx scripts/count-popular-pool-by-artist.ts --source popular
 * Omit `--source` to aggregate across every row in `ArtPoolEntry`.
 */

import { config as loadEnv } from "dotenv";
loadEnv();
loadEnv({ path: ".env.local" });

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function parseSourceFilter(): string | undefined {
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--source") {
      const next = argv[i + 1]?.trim();
      return next || undefined;
    }
    const eq = a.match(/^--source=(.+)$/);
    const v = eq?.[1]?.trim();
    if (v) return v;
  }
  return undefined;
}

async function main() {
  const source = parseSourceFilter();
  const where = source ? { source } : undefined;

  const rows = await prisma.artPoolEntry.groupBy({
    by: ["poolArtist"],
    where,
    _count: { _all: true },
    orderBy: { poolArtist: "asc" },
  });

  const withArtist = rows.filter((r) => r.poolArtist != null && r.poolArtist !== "");
  const untagged = rows.find((r) => r.poolArtist == null || r.poolArtist === "");
  const untaggedCount = untagged?._count._all ?? 0;

  const scope = source ? `source=${source}` : "all sources";
  console.log(`Art pool rows (${scope}): ${rows.reduce((s, r) => s + r._count._all, 0).toLocaleString()}`);
  console.log(`Tagged with poolArtist: ${withArtist.reduce((s, r) => s + r._count._all, 0).toLocaleString()}`);
  if (untaggedCount > 0) {
    console.log(
      `Rows with null/empty poolArtist (API did not expose one at ingest): ${untaggedCount.toLocaleString()}\n`,
    );
  } else {
    console.log();
  }

  const sorted = [...withArtist].sort((a, b) => b._count._all - a._count._all);
  const nameW = Math.max(24, ...sorted.map((r) => (r.poolArtist ?? "").length));
  for (const r of sorted) {
    const name = r.poolArtist ?? "(null)";
    console.log(`${name.padEnd(nameW)}  ${r._count._all.toLocaleString()}`);
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
