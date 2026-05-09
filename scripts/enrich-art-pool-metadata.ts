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
 * Concurrency: default 5 parallel requests per batch. Cooper is hard-capped at 1 req/s.
 * Set ENRICH_CONCURRENCY=N to override. Set ENRICH_BATCH_DELAY_MS=N for inter-batch pause.
 *
 * NOTE: Running all sources takes ~50+ hours total. Run one source at a time
 * (--only <source>) across multiple sessions.
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
    case "artic":    return fetchArticArtwork(objectId);
    case "met":      return fetchMetObject(objectId);
    case "cleveland":return fetchClevelandArtwork(objectId);
    case "whitney":  return fetchWhitneyArtwork(objectId);
    case "rijks":    return fetchRijksArtwork(objectId);
    case "vam":      return fetchVamObject(objectId);
    case "ngl":      return fetchNglObject(objectId);
    case "getty":    return fetchGettyArtwork(objectId);
    case "cooper":   return fetchCooperObject(objectId);
    case "mplus":    return fetchMplusArtwork(objectId);
    case "harvard":  return fetchHarvardObject(objectId);
    case "popular":  return fetchPopularCompositeUnderlying(objectId);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Cooper enforces ~1 req/s. Getty is slow with per-object GETs. Others are fine at higher concurrency. */
function sourceConfig(source: EnrichableSource): {
  concurrency: number;
  batchDelayMs: number;
} {
  const concurrency =
    Number.parseInt(process.env.ENRICH_CONCURRENCY ?? "", 10) || 5;
  const batchDelayMs =
    Number.parseInt(process.env.ENRICH_BATCH_DELAY_MS ?? "", 10) || 150;

  if (source === "cooper") return { concurrency: 1, batchDelayMs: 1100 };
  if (source === "getty")  return { concurrency: Math.min(concurrency, 3), batchDelayMs: Math.max(batchDelayMs, 300) };
  return { concurrency, batchDelayMs };
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

function fmtDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "--:--:--";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m ${String(sec).padStart(2, "0")}s`;
  if (m > 0) return `${m}m ${String(sec).padStart(2, "0")}s`;
  return `${sec}s`;
}

function fmtTime(date: Date): string {
  return date.toLocaleTimeString("en-US", { hour12: false });
}

function pct(n: number, total: number): string {
  return total === 0 ? "0%" : `${Math.round((n / total) * 100)}%`;
}

// ─── Arg parsing ─────────────────────────────────────────────────────────────

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
      if (v && isEnrichableSource(v)) { only = v; i++; }
    }
    const onlyEq = a.match(/^--only=(.+)$/);
    if (onlyEq?.[1] && isEnrichableSource(onlyEq[1])) only = onlyEq[1];

    if (a === "--limit") {
      const n = Number.parseInt(argv[i + 1] ?? "", 10);
      if (Number.isFinite(n) && n > 0) { limit = n; i++; }
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

// ─── Core enrichment ─────────────────────────────────────────────────────────

async function enrichSource(
  source: EnrichableSource,
  opts: { limit: number; force: boolean },
): Promise<{ enriched: number; noData: number; elapsedMs: number }> {
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
    console.log(`  [${source}] Nothing to enrich — all rows already processed.\n`);
    return { enriched: 0, noData: 0, elapsedMs: 0 };
  }

  const total = rows.length;
  const { concurrency: c, batchDelayMs: delay } = sourceConfig(source);
  console.log(
    `  [${source}] ${total.toLocaleString()} rows to enrich` +
    ` | concurrency=${c} | batch-delay=${delay}ms`,
  );

  let done = 0;
  let enriched = 0;
  let noData = 0; // null returned by API (no public image, deleted, etc.) — stored as {} so row is not retried
  const sourceStart = Date.now();
  const LOG_EVERY = Math.max(1, Math.min(200, Math.ceil(total / 100)));

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

    const updates = results.map(({ row, slot }) => {
      if (!slot) {
        noData++;
        // Store empty object {} so the row is marked as attempted and won't be retried.
        // (A SQL NULL would cause it to be picked up again on the next run.)
        return prisma.artPoolEntry.update({
          where: { id: row.id },
          data: { metadata: {} },
        });
      }
      enriched++;
      return prisma.artPoolEntry.update({
        where: { id: row.id },
        data: { metadata: slotToMetadata(slot) },
      });
    });

    await prisma.$transaction(updates);

    done += batch.length;

    if (done % LOG_EVERY === 0 || done === total) {
      const elapsedMs = Date.now() - sourceStart;
      const rowsPerSec = done / (elapsedMs / 1000);
      const remaining = total - done;
      const etaMs = remaining / rowsPerSec * 1000;
      const etaAt = new Date(Date.now() + etaMs);

      const bar = buildBar(done, total, 20);
      console.log(
        `    ${bar} ${String(done).padStart(String(total).length)}/${total} (${pct(done, total)})` +
        ` | ${rowsPerSec.toFixed(1)} rows/s | ${enriched} enriched, ${noData} no-data` +
        ` | elapsed ${fmtDuration(elapsedMs)}` +
        (done < total
          ? ` | ETA ${fmtDuration(etaMs)} (finishes ~${fmtTime(etaAt)})`
          : " | done"),
      );
    }

    if (i + concurrency < rows.length) await sleep(batchDelayMs);
  }

  const totalMs = Date.now() - sourceStart;
  console.log(
    `  [${source}] Finished — ${enriched.toLocaleString()} enriched, ${noData.toLocaleString()} no-data (no public image)` +
    ` | total time ${fmtDuration(totalMs)}\n`,
  );
  return { enriched, noData, elapsedMs: totalMs };
}

function buildBar(done: number, total: number, width: number): string {
  const filled = Math.round((done / total) * width);
  return "[" + "█".repeat(filled) + "░".repeat(width - filled) + "]";
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { only, limit, force } = parseArgs();
  const sources: EnrichableSource[] = only ? [only] : [...ENRICHABLE_SOURCES];

  // ── Pre-flight: count rows per source so we can show an upfront estimate ──
  const allCounts = await prisma.artPoolEntry.groupBy({
    by: ["source"],
    _count: { _all: true },
  });
  const countMap = new Map(allCounts.map((r) => [r.source, r._count._all]));

  const withMeta = await prisma.$queryRaw<Array<{ source: string; n: bigint }>>`
    SELECT source, COUNT(*) AS n FROM "ArtPoolEntry" WHERE metadata IS NOT NULL GROUP BY source ORDER BY source
  `;
  const metaMap = new Map(withMeta.map((r) => [r.source, Number(r.n)]));

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Art Pool Metadata Enrichment");
  console.log("═══════════════════════════════════════════════════════════════");
  if (force) console.log("  Mode: --force (overwriting existing metadata)");
  if (limit !== Number.POSITIVE_INFINITY) console.log(`  Mode: --limit ${limit} per source`);
  console.log();

  console.log("  Source plan:");
  let totalToProcess = 0;
  for (const src of sources) {
    const total = countMap.get(src) ?? 0;
    const done = metaMap.get(src) ?? 0;
    const todo = force ? total : total - done;
    const cappedTodo = limit === Number.POSITIVE_INFINITY ? todo : Math.min(todo, limit);
    const { concurrency, batchDelayMs } = sourceConfig(src);
    // Rough estimate: assume ~400ms per fetch including delay amortized
    const secEst = cappedTodo > 0
      ? Math.ceil((cappedTodo / concurrency) * ((batchDelayMs + 400) / 1000))
      : 0;
    const tag = cappedTodo === 0 ? " ✓ complete" : ` ~${fmtDuration(secEst * 1000)}`;
    console.log(
      `    ${src.padEnd(10)} ${String(cappedTodo).padStart(7)} rows remaining${tag}`,
    );
    totalToProcess += cappedTodo;
  }
  const overallEstSec = sources.reduce((acc, src) => {
    const total = countMap.get(src) ?? 0;
    const done = metaMap.get(src) ?? 0;
    const todo = force ? total : total - done;
    const cappedTodo = limit === Number.POSITIVE_INFINITY ? todo : Math.min(todo, limit);
    const { concurrency, batchDelayMs } = sourceConfig(src);
    return acc + (cappedTodo > 0
      ? Math.ceil((cappedTodo / concurrency) * ((batchDelayMs + 400) / 1000))
      : 0);
  }, 0);

  console.log();
  console.log(`  Total rows to process: ${totalToProcess.toLocaleString()}`);
  console.log(`  Estimated total time:  ~${fmtDuration(overallEstSec * 1000)}`);
  console.log(`  Started at:            ${fmtTime(new Date())}`);
  if (overallEstSec > 0) {
    console.log(
      `  Expected finish:       ~${fmtTime(new Date(Date.now() + overallEstSec * 1000))}` +
      (overallEstSec > 86400 ? ` (+${Math.floor(overallEstSec / 86400)}d)` : ""),
    );
  }
  console.log("═══════════════════════════════════════════════════════════════");
  console.log();

  const overallStart = Date.now();
  let grandEnriched = 0;
  let grandNoData = 0;

  for (let si = 0; si < sources.length; si++) {
    const src = sources[si]!;
    const remaining = sources.length - si;
    console.log(
      `── Source ${si + 1}/${sources.length}: ${src}` +
      (sources.length > 1 ? ` (${remaining - 1} source${remaining - 1 !== 1 ? "s" : ""} after this)` : ""),
    );
    const { enriched, noData } = await enrichSource(src, { limit, force });
    grandEnriched += enriched;
    grandNoData += noData;

    if (si < sources.length - 1) {
      const elapsed = Date.now() - overallStart;
      const fractionDone = (si + 1) / sources.length;
      const overallEta = fractionDone > 0 ? (elapsed / fractionDone) * (1 - fractionDone) : 0;
      console.log(
        `  Overall: ${si + 1}/${sources.length} sources done` +
        ` | elapsed ${fmtDuration(elapsed)}` +
        ` | remaining ~${fmtDuration(overallEta)}\n`,
      );
    }
  }

  const totalElapsed = Date.now() - overallStart;

  // ── Final coverage table ───────────────────────────────────────────────────
  const finalWithMeta = await prisma.$queryRaw<Array<{ source: string; n: bigint }>>`
    SELECT source, COUNT(*) AS n FROM "ArtPoolEntry" WHERE metadata IS NOT NULL GROUP BY source ORDER BY source
  `;
  const finalMetaMap = new Map(finalWithMeta.map((r) => [r.source, Number(r.n)]));

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Final coverage:");
  for (const row of allCounts.sort((a, b) => a.source.localeCompare(b.source))) {
    const total = row._count._all;
    const meta = finalMetaMap.get(row.source) ?? 0;
    const bar = buildBar(meta, total, 15);
    console.log(`    ${row.source.padEnd(10)} ${bar} ${String(meta).padStart(7)}/${total} (${pct(meta, total)})`);
  }
  console.log();
  console.log(`  Enriched this run: ${grandEnriched.toLocaleString()} rows (have metadata)`);
  console.log(`  No-data this run:  ${grandNoData.toLocaleString()} rows (no public image — stored as {} to skip on re-run)`);
  console.log(`  Total time:        ${fmtDuration(totalElapsed)}`);
  console.log("═══════════════════════════════════════════════════════════════");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
