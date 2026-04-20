/**
 * Fetches eligible object IDs from partner APIs and fills `ArtPoolEntry`.
 * Run from project root: `npm run art-pool:build`
 * Single source (does not delete other museums): `npm run art-pool:build -- --only whitney`
 * Popular cross-museum batch: `npm run art-pool:build -- --only popular`
 * Skip slow Met/Rijks popular passes: `--popular-skip-met` / `--popular-skip-rijks`
 * (or `POPULAR_POOL_SKIP_MET=1` / `POPULAR_POOL_SKIP_RIJK=1`).
 * Top up one source without clearing it: `--only met --append`
 * Requires DATABASE_URL, optional HARVARD_ART_API_KEY for Harvard rows,
 * optional NMA_API_KEY for higher NMA API rate limits (pool build / random cards work without it),
 * optional COOPER_POOL_MAX_PAGES / COOPER_POOL_PAGE_DELAY_MS for Cooper Hewitt (~1 req/s; ES caps offset pages ≈39 at 250/page ≈9.75k IDs).
 * Met pool logs ISO-timestamped lines (flushed) during search + enrichment; tune with
 * MET_POOL_PROGRESS_EVERY_BATCHES, MET_POOL_ARTIST_CONCURRENCY, MET_POOL_ARTIST_DELAY_MS,
 * MET_POOL_OBJECT_FETCH_ATTEMPTS, MET_HTTP_USER_AGENT (and optional MET_HTTP_ACCEPT_LANGUAGE).
 * Save id list after search (before per-object calls): `MET_POOL_SAVE_ID_LIST=./data/met-pool-ids.json`.
 * Enrich only (skip search): `--only met --met-enrich-only` (uses DB rows with empty `poolArtist` by default),
 * or `--met-id-file ./data/met-pool-ids.json` / `MET_POOL_IDS_FILE`. Set `MET_POOL_ENRICH_MISSING=0` to re-fetch artists for all Met rows.
 * Smoke test: `npm run art-pool:build:met:test` (quick search + 1% ids, `--append` so met
 * rows are not wiped). Also MET_POOL_QUICK_SEARCH, MET_POOL_TEST_FRACTION, MET_POOL_MAX_IDS.
 */

import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";

import { config as loadEnv } from "dotenv";
loadEnv();
loadEnv({ path: ".env.local" });
import { PrismaClient } from "@prisma/client";
import { collectArticObjectIdsForPool } from "@/lib/art-sources/artic";
import { collectClevelandObjectIdsForPool } from "@/lib/art-sources/cleveland";
import { collectHarvardObjectIdsForPool } from "@/lib/art-sources/harvard";
import {
  collectMetObjectIdsForPool,
  enrichMetPoolRowsForObjectIds,
  parseMetPoolIdsFromFileContent,
} from "@/lib/art-sources/met";
import { collectMplusObjectIdsForPool } from "@/lib/art-sources/mplus";
import { collectGettyObjectIdsForPool } from "@/lib/art-sources/getty";
import { collectNglObjectIdsForPool } from "@/lib/art-sources/ngl";
import { collectRijksObjectIdsForPool } from "@/lib/art-sources/rijks";
import { collectVamObjectIdsForPool } from "@/lib/art-sources/vam";
import { collectNmaObjectIdsForPool } from "@/lib/art-sources/nma";
import { collectCooperObjectIdsForPool } from "@/lib/art-sources/cooper";
import { collectWhitneyObjectIdsForPool } from "@/lib/art-sources/whitney";
import {
  collectPopularPoolRows,
  type PopularPoolCollectOptions,
} from "@/lib/art-sources/collect-popular-pool";
import type { ArtPoolIngestRow } from "@/lib/art-sources/art-pool-ingest";
import type { PopularPoolIngestRow } from "@/lib/art-sources/popular-pool-types";

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
  "popular",
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

/** With `--only popular` or full build popular step; env vars are read inside `collectPopularPoolRows`. */
function parsePopularPoolCollectCli(): PopularPoolCollectOptions {
  return {
    skipMet: process.argv.includes("--popular-skip-met"),
    skipRijks: process.argv.includes("--popular-skip-rijks"),
  };
}

function parseMetEnrichOnly(): boolean {
  return (
    process.argv.includes("--met-enrich-only") ||
    process.env.MET_POOL_ENRICH_ONLY?.trim() === "1"
  );
}

/** `--met-id-file path` or `--met-id-file=path`; else `MET_POOL_IDS_FILE`. */
function parseMetIdFileArg(): string | null {
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--met-id-file") {
      const next = argv[i + 1]?.trim();
      if (next && !next.startsWith("-")) return next;
      return null;
    }
    const eq = a.match(/^--met-id-file=(.+)$/);
    const v = eq?.[1]?.trim();
    if (v) return v;
  }
  const env = process.env.MET_POOL_IDS_FILE?.trim();
  return env && env.length > 0 ? env : null;
}

async function upsertMetPoolArtistRows(rows: ArtPoolIngestRow[]): Promise<number> {
  const CHUNK = 80;
  let n = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    await prisma.$transaction(
      chunk.map((r) =>
        prisma.artPoolEntry.upsert({
          where: {
            source_objectId: { source: "met", objectId: r.objectId },
          },
          create: {
            source: "met",
            objectId: r.objectId,
            poolArtist: r.poolArtist ?? null,
          },
          update: { poolArtist: r.poolArtist ?? null },
        }),
      ),
    );
    n += chunk.length;
    console.log(`  met: upserted poolArtist ${n}/${rows.length}`);
  }
  return rows.length;
}

function popularRowsToPoolRows(rows: PopularPoolIngestRow[]): ArtPoolIngestRow[] {
  return rows.map((r) => ({
    objectId: r.compositeObjectId,
    poolArtist: r.poolArtist,
  }));
}

async function insertPoolRows(source: string, rows: ArtPoolIngestRow[]): Promise<void> {
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const result = await prisma.artPoolEntry.createMany({
      data: chunk.map((r) => ({
        source,
        objectId: r.objectId,
        poolArtist: r.poolArtist ?? null,
      })),
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
  const metIdFile = source === "met" ? parseMetIdFileArg() : null;
  const metEnrichOnly =
    source === "met" && (parseMetEnrichOnly() || Boolean(metIdFile));
  if (append) {
    console.log(
      `Append mode: keeping existing ${source} rows; new IDs merge in.\n`,
    );
  } else if (metEnrichOnly) {
    console.log("Keeping existing met rows (enrich-only mode).\n");
  } else {
    const deleted = await prisma.artPoolEntry.deleteMany({ where: { source } });
    console.log(`Removed existing ${source} rows: ${deleted.count}\n`);
  }

  switch (source) {
    case "artic": {
      console.log("Art Institute of Chicago…");
      const rows = await collectArticObjectIdsForPool();
      await insertPoolRows("artic", rows);
      console.log(`  unique AIC IDs collected: ${rows.length}\n`);
      break;
    }
    case "met": {
      if (metEnrichOnly) {
        console.log("The Metropolitan Museum of Art (enrich poolArtist only)…\n");
        let ids: number[];
        if (metIdFile) {
          const abs = resolvePath(process.cwd(), metIdFile);
          const raw = readFileSync(abs, "utf8");
          ids = parseMetPoolIdsFromFileContent(raw);
          console.log(
            `  ids from file: ${abs} (${ids.length.toLocaleString()} numeric ids)\n`,
          );
        } else {
          const missingOnly = process.env.MET_POOL_ENRICH_MISSING?.trim() !== "0";
          const entries = await prisma.artPoolEntry.findMany({
            where: {
              source: "met",
              ...(missingOnly
                ? { OR: [{ poolArtist: null }, { poolArtist: "" }] }
                : {}),
            },
            select: { objectId: true },
          });
          ids = entries
            .map((e: { objectId: string }) => Number.parseInt(e.objectId, 10))
            .filter((n: number) => Number.isFinite(n) && n > 0);
          console.log(
            `  ids from DB: ${ids.length.toLocaleString()} met rows${missingOnly ? " with missing poolArtist" : " (all)"}\n`,
          );
        }
        if (ids.length === 0) {
          console.log("  nothing to enrich; exiting met step.\n");
          break;
        }
        const rows = await enrichMetPoolRowsForObjectIds(ids);
        await upsertMetPoolArtistRows(rows);
        console.log(`  met enrich-only done: ${rows.length.toLocaleString()} rows upserted\n`);
        break;
      }
      console.log("The Metropolitan Museum of Art…");
      const rows = await collectMetObjectIdsForPool();
      await insertPoolRows("met", rows);
      console.log(`  unique Met IDs collected: ${rows.length}\n`);
      break;
    }
    case "cleveland": {
      console.log("Cleveland Museum of Art…");
      const rows = await collectClevelandObjectIdsForPool();
      await insertPoolRows("cleveland", rows);
      console.log(`  unique Cleveland IDs collected: ${rows.length}\n`);
      break;
    }
    case "whitney": {
      console.log("Whitney Museum of American Art…");
      const rows = await collectWhitneyObjectIdsForPool();
      await insertPoolRows("whitney", rows);
      console.log(`  unique Whitney IDs collected: ${rows.length}\n`);
      break;
    }
    case "rijks": {
      console.log("Rijksmuseum…");
      const rows = await collectRijksObjectIdsForPool();
      await insertPoolRows("rijks", rows);
      console.log(`  unique Rijksmuseum IDs collected: ${rows.length}\n`);
      break;
    }
    case "harvard": {
      console.log("Harvard Art Museums…");
      const rows = await collectHarvardObjectIdsForPool();
      if (rows.length === 0) {
        console.log(
          "  skipped (set HARVARD_ART_API_KEY to insert Harvard rows)\n",
        );
      } else {
        await insertPoolRows("harvard", rows);
        console.log(`  unique Harvard IDs collected: ${rows.length}\n`);
      }
      break;
    }
    case "ngl": {
      console.log("National Gallery, London…");
      const rows = await collectNglObjectIdsForPool();
      await insertPoolRows("ngl", rows);
      console.log(`  unique National Gallery (London) IDs collected: ${rows.length}\n`);
      break;
    }
    case "getty": {
      console.log("J. Paul Getty Museum…");
      const rows = await collectGettyObjectIdsForPool();
      await insertPoolRows("getty", rows);
      console.log(`  unique Getty IDs collected: ${rows.length}\n`);
      break;
    }
    case "vam": {
      console.log("Victoria and Albert Museum…");
      const rows = await collectVamObjectIdsForPool();
      await insertPoolRows("vam", rows);
      console.log(`  unique V&A IDs collected: ${rows.length}\n`);
      break;
    }
    case "mplus": {
      console.log("M+ Museum…");
      const rows = await collectMplusObjectIdsForPool();
      await insertPoolRows("mplus", rows);
      console.log(`  unique M+ IDs collected: ${rows.length}\n`);
      break;
    }
    case "nma": {
      console.log("National Museum of Australia…");
      const rows = await collectNmaObjectIdsForPool();
      await insertPoolRows("nma", rows);
      console.log(`  unique NMA IDs collected: ${rows.length}\n`);
      break;
    }
    case "cooper": {
      console.log("Cooper Hewitt, Smithsonian Design Museum…");
      const rows = await collectCooperObjectIdsForPool();
      await insertPoolRows("cooper", rows);
      console.log(`  unique Cooper Hewitt IDs collected: ${rows.length}\n`);
      break;
    }
    case "popular": {
      console.log("Popular artists (cross-museum composite ids + ingest artist)…");
      const rows = await collectPopularPoolRows(parsePopularPoolCollectCli());
      await insertPoolRows("popular", popularRowsToPoolRows(rows));
      console.log(`  unique popular composite keys: ${rows.length}\n`);
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
      "Usage: --only <artic|met|cleveland|whitney|rijks|harvard|ngl|getty|vam|mplus|nma|cooper|popular> [--append]",
    );
    process.exitCode = 1;
    return;
  }

  console.log("Deleting existing art pool rows…");
  const deleted = await prisma.artPoolEntry.deleteMany({});
  console.log(`  removed ${deleted.count} rows\n`);

  console.log("Art Institute of Chicago…");
  const articRows = await collectArticObjectIdsForPool();
  await insertPoolRows("artic", articRows);
  console.log(`  unique AIC IDs collected: ${articRows.length}\n`);

  console.log("The Metropolitan Museum of Art…");
  const metRows = await collectMetObjectIdsForPool();
  await insertPoolRows("met", metRows);
  console.log(`  unique Met IDs collected: ${metRows.length}\n`);

  console.log("Cleveland Museum of Art…");
  const cleRows = await collectClevelandObjectIdsForPool();
  await insertPoolRows("cleveland", cleRows);
  console.log(`  unique Cleveland IDs collected: ${cleRows.length}\n`);

  console.log("Whitney Museum of American Art…");
  const whitneyRows = await collectWhitneyObjectIdsForPool();
  await insertPoolRows("whitney", whitneyRows);
  console.log(`  unique Whitney IDs collected: ${whitneyRows.length}\n`);

  console.log("Rijksmuseum…");
  const rijksRows = await collectRijksObjectIdsForPool();
  await insertPoolRows("rijks", rijksRows);
  console.log(`  unique Rijksmuseum IDs collected: ${rijksRows.length}\n`);

  console.log("Harvard Art Museums…");
  const harvRows = await collectHarvardObjectIdsForPool();
  if (harvRows.length === 0) {
    console.log(
      "  skipped (set HARVARD_ART_API_KEY to include Harvard in the pool)\n",
    );
  } else {
    await insertPoolRows("harvard", harvRows);
    console.log(`  unique Harvard IDs collected: ${harvRows.length}\n`);
  }

  console.log("National Gallery, London…");
  const nglRows = await collectNglObjectIdsForPool();
  await insertPoolRows("ngl", nglRows);
  console.log(
    `  unique National Gallery (London) IDs collected: ${nglRows.length}\n`,
  );

  console.log("J. Paul Getty Museum…");
  const gettyRows = await collectGettyObjectIdsForPool();
  await insertPoolRows("getty", gettyRows);
  console.log(`  unique Getty IDs collected: ${gettyRows.length}\n`);

  console.log("Victoria and Albert Museum…");
  const vamRows = await collectVamObjectIdsForPool();
  await insertPoolRows("vam", vamRows);
  console.log(`  unique V&A IDs collected: ${vamRows.length}\n`);

  console.log("M+ Museum…");
  const mplusRows = await collectMplusObjectIdsForPool();
  await insertPoolRows("mplus", mplusRows);
  console.log(`  unique M+ IDs collected: ${mplusRows.length}\n`);

  console.log("National Museum of Australia…");
  const nmaRows = await collectNmaObjectIdsForPool();
  await insertPoolRows("nma", nmaRows);
  console.log(`  unique NMA IDs collected: ${nmaRows.length}\n`);

  console.log("Cooper Hewitt, Smithsonian Design Museum…");
  const cooperRows = await collectCooperObjectIdsForPool();
  await insertPoolRows("cooper", cooperRows);
  console.log(`  unique Cooper Hewitt IDs collected: ${cooperRows.length}\n`);

  console.log("Popular artists (cross-museum composite ids + ingest artist)…");
  const popularRows = await collectPopularPoolRows(parsePopularPoolCollectCli());
  await insertPoolRows("popular", popularRowsToPoolRows(popularRows));
  console.log(`  unique popular composite keys: ${popularRows.length}\n`);

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
