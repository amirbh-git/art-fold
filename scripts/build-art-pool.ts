/**
 * Fetches eligible object IDs from partner APIs and fills `ArtPoolEntry`.
 * Run from project root: `npm run art-pool:build`
 * Single source (does not delete other museums): `npm run art-pool:build -- --only whitney`
 * Top up one source without clearing it: `--only met --append`
 * Requires DATABASE_URL, optional HARVARD_ART_API_KEY for Harvard rows,
 * optional NMA_API_KEY for higher NMA API rate limits (pool build / random cards work without it),
 * optional COOPER_POOL_MAX_PAGES / COOPER_POOL_PAGE_DELAY_MS for Cooper Hewitt (~1 req/s; ES caps offset pages ≈39 at 250/page ≈9.75k IDs).
 */

import { config as loadEnv } from "dotenv";
loadEnv();
loadEnv({ path: ".env.local" });
import { PrismaClient } from "@prisma/client";
import { collectArticObjectIdsForPool } from "@/lib/art-sources/artic";
import { collectClevelandObjectIdsForPool } from "@/lib/art-sources/cleveland";
import { collectHarvardObjectIdsForPool } from "@/lib/art-sources/harvard";
import { collectMetObjectIdsForPool } from "@/lib/art-sources/met";
import { collectMplusObjectIdsForPool } from "@/lib/art-sources/mplus";
import { collectGettyObjectIdsForPool } from "@/lib/art-sources/getty";
import { collectNglObjectIdsForPool } from "@/lib/art-sources/ngl";
import { collectRijksObjectIdsForPool } from "@/lib/art-sources/rijks";
import { collectVamObjectIdsForPool } from "@/lib/art-sources/vam";
import { collectNmaObjectIdsForPool } from "@/lib/art-sources/nma";
import { collectCooperObjectIdsForPool } from "@/lib/art-sources/cooper";
import { collectWhitneyObjectIdsForPool } from "@/lib/art-sources/whitney";

const prisma = new PrismaClient();
const BATCH = 2_000;

const POOL_SOURCES = [
  "artic",
  "met",
  "cleveland",
  "whitney",
  "rijks",
  "harvard",
  "ngl",
  "getty",
  "vam",
  "mplus",
  "nma",
  "cooper",
] as const;
type PoolSource = (typeof POOL_SOURCES)[number];

function isPoolSource(s: string): s is PoolSource {
  return (POOL_SOURCES as readonly string[]).includes(s);
}

/** `--only whitney` or `--only=whitney` */
function parseOnlySource(): PoolSource | null {
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--only") {
      const next = argv[i + 1]?.trim();
      if (next && isPoolSource(next)) return next;
      return null;
    }
    const eq = a.match(/^--only=(.+)$/);
    const v = eq?.[1]?.trim();
    if (v && isPoolSource(v)) return v;
  }
  return null;
}

function parseAppend(): boolean {
  return process.argv.includes("--append");
}

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

async function printCountsBySource(): Promise<void> {
  const counts = await prisma.artPoolEntry.groupBy({
    by: ["source"],
    _count: { _all: true },
  });
  console.log("Row counts by source:");
  for (const row of counts.sort((a, b) => a.source.localeCompare(b.source))) {
    console.log(`  ${row.source}: ${row._count._all}`);
  }
}

async function buildOneSource(
  source: PoolSource,
  options: { append?: boolean } = {},
): Promise<void> {
  const append = options.append === true;
  if (append) {
    console.log(
      `Append mode: keeping existing ${source} rows; new IDs merge in.\n`,
    );
  } else {
    const deleted = await prisma.artPoolEntry.deleteMany({ where: { source } });
    console.log(`Removed existing ${source} rows: ${deleted.count}\n`);
  }

  switch (source) {
    case "artic": {
      console.log("Art Institute of Chicago…");
      const ids = await collectArticObjectIdsForPool();
      await insertIds("artic", ids.map(String));
      console.log(`  unique AIC IDs collected: ${ids.length}\n`);
      break;
    }
    case "met": {
      console.log("The Metropolitan Museum of Art…");
      const ids = await collectMetObjectIdsForPool();
      await insertIds("met", ids.map(String));
      console.log(`  unique Met IDs collected: ${ids.length}\n`);
      break;
    }
    case "cleveland": {
      console.log("Cleveland Museum of Art…");
      const ids = await collectClevelandObjectIdsForPool();
      await insertIds("cleveland", ids.map(String));
      console.log(`  unique Cleveland IDs collected: ${ids.length}\n`);
      break;
    }
    case "whitney": {
      console.log("Whitney Museum of American Art…");
      const ids = await collectWhitneyObjectIdsForPool();
      await insertIds("whitney", ids.map(String));
      console.log(`  unique Whitney IDs collected: ${ids.length}\n`);
      break;
    }
    case "rijks": {
      console.log("Rijksmuseum…");
      const ids = await collectRijksObjectIdsForPool();
      await insertIds("rijks", ids.map(String));
      console.log(`  unique Rijksmuseum IDs collected: ${ids.length}\n`);
      break;
    }
    case "harvard": {
      console.log("Harvard Art Museums…");
      const ids = await collectHarvardObjectIdsForPool();
      if (ids.length === 0) {
        console.log(
          "  skipped (set HARVARD_ART_API_KEY to insert Harvard rows)\n",
        );
      } else {
        await insertIds("harvard", ids.map(String));
        console.log(`  unique Harvard IDs collected: ${ids.length}\n`);
      }
      break;
    }
    case "ngl": {
      console.log("National Gallery, London…");
      const ids = await collectNglObjectIdsForPool();
      await insertIds("ngl", ids.map(String));
      console.log(`  unique National Gallery (London) IDs collected: ${ids.length}\n`);
      break;
    }
    case "getty": {
      console.log("J. Paul Getty Museum…");
      const ids = await collectGettyObjectIdsForPool();
      await insertIds("getty", ids.map(String));
      console.log(`  unique Getty IDs collected: ${ids.length}\n`);
      break;
    }
    case "vam": {
      console.log("Victoria and Albert Museum…");
      const ids = await collectVamObjectIdsForPool();
      await insertIds("vam", ids.map(String));
      console.log(`  unique V&A IDs collected: ${ids.length}\n`);
      break;
    }
    case "mplus": {
      console.log("M+ Museum…");
      const ids = await collectMplusObjectIdsForPool();
      await insertIds("mplus", ids.map(String));
      console.log(`  unique M+ IDs collected: ${ids.length}\n`);
      break;
    }
    case "nma": {
      console.log("National Museum of Australia…");
      const ids = await collectNmaObjectIdsForPool();
      await insertIds("nma", ids.map(String));
      console.log(`  unique NMA IDs collected: ${ids.length}\n`);
      break;
    }
    case "cooper": {
      console.log("Cooper Hewitt, Smithsonian Design Museum…");
      const ids = await collectCooperObjectIdsForPool();
      await insertIds("cooper", ids.map(String));
      console.log(`  unique Cooper Hewitt IDs collected: ${ids.length}\n`);
      break;
    }
    default:
      break;
  }

  await printCountsBySource();
}

async function main() {
  const only = parseOnlySource();
  const append = parseAppend();
  if (only) {
    console.log(`Incremental build: ${only} only (other sources unchanged).\n`);
    await buildOneSource(only, { append });
    return;
  }

  if (append) {
    console.error("--append requires --only <source>");
    process.exitCode = 1;
    return;
  }

  if (process.argv.includes("--only")) {
    console.error(
      "Usage: --only <artic|met|cleveland|whitney|rijks|harvard|ngl|getty|vam|mplus|nma|cooper> [--append]",
    );
    process.exitCode = 1;
    return;
  }

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

  console.log("The Metropolitan Museum of Art…");
  const metIds = await collectMetObjectIdsForPool();
  await insertIds(
    "met",
    metIds.map(String),
  );
  console.log(`  unique Met IDs collected: ${metIds.length}\n`);

  console.log("Cleveland Museum of Art…");
  const cleIds = await collectClevelandObjectIdsForPool();
  await insertIds(
    "cleveland",
    cleIds.map(String),
  );
  console.log(`  unique Cleveland IDs collected: ${cleIds.length}\n`);

  console.log("Whitney Museum of American Art…");
  const whitneyIds = await collectWhitneyObjectIdsForPool();
  await insertIds(
    "whitney",
    whitneyIds.map(String),
  );
  console.log(`  unique Whitney IDs collected: ${whitneyIds.length}\n`);

  console.log("Rijksmuseum…");
  const rijksIds = await collectRijksObjectIdsForPool();
  await insertIds(
    "rijks",
    rijksIds.map(String),
  );
  console.log(`  unique Rijksmuseum IDs collected: ${rijksIds.length}\n`);

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

  console.log("National Gallery, London…");
  const nglIds = await collectNglObjectIdsForPool();
  await insertIds(
    "ngl",
    nglIds.map(String),
  );
  console.log(
    `  unique National Gallery (London) IDs collected: ${nglIds.length}\n`,
  );

  console.log("J. Paul Getty Museum…");
  const gettyIds = await collectGettyObjectIdsForPool();
  await insertIds(
    "getty",
    gettyIds.map(String),
  );
  console.log(`  unique Getty IDs collected: ${gettyIds.length}\n`);

  console.log("Victoria and Albert Museum…");
  const vamIds = await collectVamObjectIdsForPool();
  await insertIds(
    "vam",
    vamIds.map(String),
  );
  console.log(`  unique V&A IDs collected: ${vamIds.length}\n`);

  console.log("M+ Museum…");
  const mplusIds = await collectMplusObjectIdsForPool();
  await insertIds(
    "mplus",
    mplusIds.map(String),
  );
  console.log(`  unique M+ IDs collected: ${mplusIds.length}\n`);

  console.log("National Museum of Australia…");
  const nmaIds = await collectNmaObjectIdsForPool();
  await insertIds(
    "nma",
    nmaIds.map(String),
  );
  console.log(`  unique NMA IDs collected: ${nmaIds.length}\n`);

  console.log("Cooper Hewitt, Smithsonian Design Museum…");
  const cooperIds = await collectCooperObjectIdsForPool();
  await insertIds(
    "cooper",
    cooperIds.map(String),
  );
  console.log(`  unique Cooper Hewitt IDs collected: ${cooperIds.length}\n`);

  await printCountsBySource();
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
