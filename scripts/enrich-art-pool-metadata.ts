/**
 * Backfills `metadata` on existing ArtPoolEntry rows by calling each source's
 * detail fetch function. No IDs are added or removed.
 *
 * Run all sources:    npm run art-pool:enrich-metadata
 * Single source:      npm run art-pool:enrich-metadata -- --only met
 * Cap rows processed: npm run art-pool:enrich-metadata -- --only getty --limit 500
 * Overwrite existing: npm run art-pool:enrich-metadata -- --force
 *
 * Sources: artic, met, cleveland, whitney, rijks, vam, ngl, getty, cooper, mplus, harvard, popular
 * (nma is excluded)
 *
 * Concurrency is kept low to respect API rate limits. Cooper is capped at 1 req/s.
 * Set ENRICH_CONCURRENCY=N to override the default (3).
 * Set ENRICH_BATCH_DELAY_MS=N to override the inter-batch pause (200ms default).
 */

import { config as loadEnv } from "dotenv";
loadEnv();
loadEnv({ path: ".env.local" });

import { PrismaClient, Prisma } from "@prisma/client";
import { fetchArticArtwork } from "@/lib/art-sources/artic";
import { fetchClevelandArtwork } from "@/lib/art-sources/cleveland";
import { fetchHarvardObject } from "@/lib/art-sources/harvard";
import { fetchMetObject } from "@/lib/art-sources/met";
import { fetchMplusArtwork } from "@/lib/art-sources/mplus";
import { fetchGettyArtwork } from "@/lib/art-sources/getty";
import { fetchNglObject } from "@/lib/art-sources/ngl";
import { fetchRijksArtwork } from "@/lib/art-sources/rijks";
import { fetchVamObject } from "@/lib/art-sources/vam";
import { fetchWhitneyArtwork } from "@/lib/art-sources/whitney";
import { fetchCooperObject } from "@/lib/art-sources/cooper";
import { fetchPopularCompositeUnderlying } from "@/lib/art-sources/popular";
import type { WallSlotPayload } from "@/lib/art-sources/types";

const prisma = new PrismaClient();

const ENRICHABLE_SOURCES = [
  "artic",
  "met",
  "cleveland",
  "whitney",
  "rijks",
  "vam",
  "ngl",
  "getty",
  "cooper",
  "mplus",
  "harvard",
  "popular",
] as const;
type EnrichableSource = (typeof ENRICHABLE_SOURCES)[number];

function isEnrichableSource(s: string): s is EnrichableSource {
  return (ENRICHABLE_SOURCES as readonly string[]).includes(s);
}

type PoolMetadata = {
  title?: string;
  imageUrl?: string;
  objectUrl?: string;
  objectDate?: string;
  medium?: string;
  dimensions?: string;
  department?: string;
  creditLine?: string;
  artistBio?: string;
};

function slotToMetadata(slot: WallSlotPayload): PoolMetadata {
  const m: PoolMetadata = {};
  if (slot.title?.trim()) m.title = slot.title.trim();
  if (slot.imageUrl?.trim()) m.imageUrl = slot.imageUrl.trim();
  if (slot.objectUrl?.trim()) m.objectUrl = slot.objectUrl.trim();
  if (slot.objectDate?.trim()) m.objectDate = slot.objectDate.trim();
  if (slot.medium?.trim()) m.medium = slot.medium.trim();
  if (slot.dimensions?.trim()) m.dimensions = slot.dimensions.trim();
  if (slot.department?.trim()) m.department = slot.department.trim();
  if (slot.creditLine?.trim()) m.creditLine = slot.creditLine.trim();
  if (slot.artistBio?.trim()) m.artistBio = slot.artistBio.trim();
  return m;
}

async function fetchForSource(
  source: EnrichableSource,
  objectId: string,
): Promise<WallSlotPayload | null> {
  switch (source) {
    case "artic":
      return fetchArticArtwork(objectId);
    case "met":
      return fetchMetObject(objectId);
    case "cleveland":
      return fetchClevelandArtwork(objectId);
    case "whitney":
      return fetchWhitneyArtwork(objectId);
    case "rijks":
      return fetchRijksArtwork(objectId);
    case "vam":
      return fetchVamObject(objectId);
    case "ngl":
      return fetchNglObject(objectId);
    case "getty":
      return fetchGettyArtwork(objectId);
    case "cooper":
      return fetchCooperObject(objectId);
    case "mplus":
      return fetchMplusArtwork(objectId);
    case "harvard":
      return fetchHarvardObject(objectId);
    case "popular":
      return fetchPopularCompositeUnderlying(objectId);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Cooper enforces ~1 req/s; all other sources tolerate higher concurrency. */
function sourceConfig(source: EnrichableSource): {
  concurrency: number;
  batchDelayMs: number;
} {
  const concurrency =
    Number.parseInt(process.env.ENRICH_CONCURRENCY ?? "", 10) || 3;
  const batchDelayMs =
    Number.parseInt(process.env.ENRICH_BATCH_DELAY_MS ?? "", 10) || 200;

  if (source === "cooper") {
    return { concurrency: 1, batchDelayMs: 1100 };
  }
  if (source === "getty") {
    return { concurrency: Math.min(concurrency, 3), batchDelayMs: Math.max(batchDelayMs, 300) };
  }
  return { concurrency, batchDelayMs };
}

function parseArgs(): {
  only: EnrichableSource | null;
  limit: number;
  force: boolean;
} {
  const argv = process.argv.slice(2);
  let only: EnrichableSource | null = null;
  let limit = Number.POSITIVE_INFINITY;
  let force = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--only") {
      const v = argv[i + 1]?.trim();
      if (v && isEnrichableSource(v)) only = v;
    }
    const onlyEq = a.match(/^--only=(.+)$/);
    if (onlyEq?.[1] && isEnrichableSource(onlyEq[1])) only = onlyEq[1];

    if (a === "--limit") {
      const n = Number.parseInt(argv[i + 1] ?? "", 10);
      if (Number.isFinite(n) && n > 0) limit = n;
    }
    const limitEq = a.match(/^--limit=(\d+)$/);
    if (limitEq?.[1]) {
      const n = Number.parseInt(limitEq[1], 10);
      if (Number.isFinite(n) && n > 0) limit = n;
    }

    if (a === "--force") force = true;
  }
  return { only, limit, force };
}

async function enrichSource(
  source: EnrichableSource,
  opts: { limit: number; force: boolean },
): Promise<void> {
  const { limit, force } = opts;
  const { concurrency, batchDelayMs } = sourceConfig(source);

  const rows = await prisma.artPoolEntry.findMany({
    where: {
      source,
      ...(force ? {} : { metadata: { equals: Prisma.DbNull } }),
    },
    select: { id: true, objectId: true },
    take: limit === Number.POSITIVE_INFINITY ? undefined : limit,
  });

  if (rows.length === 0) {
    console.log(`  ${source}: no rows to enrich (all done or source absent)\n`);
    return;
  }

  console.log(`  ${source}: enriching ${rows.length} rows (concurrency=${concurrency}, delay=${batchDelayMs}ms)…`);

  let done = 0;
  let fetched = 0;
  let failed = 0;

  for (let i = 0; i < rows.length; i += concurrency) {
    const batch = rows.slice(i, i + concurrency);

    const results = await Promise.all(
      batch.map(async (row) => {
        try {
          const slot = await fetchForSource(source, row.objectId);
          return { row, slot };
        } catch {
          return { row, slot: null };
        }
      }),
    );

    const updates = results.flatMap(({ row, slot }) => {
      if (!slot) {
        failed++;
        return [];
      }
      fetched++;
      return [
        prisma.artPoolEntry.update({
          where: { id: row.id },
          data: { metadata: slotToMetadata(slot) },
        }),
      ];
    });

    if (updates.length > 0) {
      await prisma.$transaction(updates);
    }

    done += batch.length;

    if (done % 50 === 0 || done === rows.length) {
      console.log(`    ${source}: ${done}/${rows.length} processed (${fetched} enriched, ${failed} failed)`);
    }

    if (i + concurrency < rows.length) {
      await sleep(batchDelayMs);
    }
  }

  console.log(`  ${source}: done — ${fetched} enriched, ${failed} failed\n`);
}

async function main(): Promise<void> {
  const { only, limit, force } = parseArgs();

  const sources: EnrichableSource[] = only
    ? [only]
    : [...ENRICHABLE_SOURCES];

  if (only) {
    console.log(`Enriching metadata: ${only} only${force ? " (force)" : ""}${limit !== Number.POSITIVE_INFINITY ? ` (limit ${limit})` : ""}\n`);
  } else {
    console.log(`Enriching metadata: all sources${force ? " (force)" : ""}${limit !== Number.POSITIVE_INFINITY ? ` (limit ${limit} per source)` : ""}\n`);
  }

  for (const source of sources) {
    await enrichSource(source, { limit, force });
  }

  const counts = await prisma.artPoolEntry.groupBy({
    by: ["source"],
    _count: { _all: true },
  });
  const withMeta = await prisma.$queryRaw<Array<{ source: string; n: bigint }>>`
    SELECT source, COUNT(*) AS n FROM "ArtPoolEntry" WHERE metadata IS NOT NULL GROUP BY source ORDER BY source
  `;
  const metaMap = new Map(withMeta.map((r) => [r.source, Number(r.n)]));

  console.log("Coverage after enrichment:");
  for (const row of counts.sort((a, b) => a.source.localeCompare(b.source))) {
    const total = row._count._all;
    const meta = metaMap.get(row.source) ?? 0;
    console.log(`  ${row.source}: ${meta}/${total} rows have metadata`);
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
