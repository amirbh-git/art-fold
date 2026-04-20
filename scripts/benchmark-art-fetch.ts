/**
 * Measures end-to-end time to load one artwork card per museum (same code path as the app).
 * Prefers a real objectId from ArtPoolEntry when DATABASE_URL is available.
 *
 * Usage: npx tsx scripts/benchmark-art-fetch.ts
 * Optional: BENCHMARK_REPEATS=5 BENCHMARK_WARMUP=1 (extra untimed warmup per source)
 */

import { config as loadEnv } from "dotenv";
loadEnv();
loadEnv({ path: ".env.local" });

import { performance } from "node:perf_hooks";
import { PrismaClient } from "@prisma/client";
import { fetchArticArtwork } from "@/lib/art-sources/artic";
import { fetchClevelandArtwork } from "@/lib/art-sources/cleveland";
import { fetchCooperObject } from "@/lib/art-sources/cooper";
import { fetchGettyArtwork } from "@/lib/art-sources/getty";
import { fetchHarvardObject, isHarvardConfigured } from "@/lib/art-sources/harvard";
import { fetchMetObject } from "@/lib/art-sources/met";
import { fetchMplusArtwork } from "@/lib/art-sources/mplus";
import { fetchNglObject } from "@/lib/art-sources/ngl";
import { fetchNmaObject } from "@/lib/art-sources/nma";
import { fetchRijksArtwork } from "@/lib/art-sources/rijks";
import { fetchVamObject } from "@/lib/art-sources/vam";
import { fetchWhitneyArtwork } from "@/lib/art-sources/whitney";
import { fetchPopularCompositeUnderlying } from "@/lib/art-sources/popular";
import type { ArtSourceId, WallSlotPayload } from "@/lib/art-sources/types";

/** Sources included in the benchmark (matches production random mix). */
type BenchSource = ArtSourceId;

const REPEATS = Math.max(
  1,
  Number.parseInt(process.env.BENCHMARK_REPEATS ?? "5", 10) || 5,
);
const WARMUP = Math.max(
  0,
  Number.parseInt(process.env.BENCHMARK_WARMUP ?? "0", 10) || 0,
);

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Pause between timed runs (Cooper Hewitt ~1 req/s). Default 400ms. */
const GAP_MS = Math.max(
  0,
  Number.parseInt(process.env.BENCHMARK_GAP_MS ?? "400", 10) || 0,
);

/** Known-good fallbacks when the pool row is missing (public objects with images). */
const FALLBACK_ID: Record<BenchSource, string> = {
  met: "45734",
  artic: "27992",
  harvard: "299843",
  cleveland: "751763",
  whitney: "4213",
  rijks: "2001",
  ngl: "O102004",
  getty: "665ccd8a-9f3c-4247-9b56-9e2d6a2eb3f6",
  vam: "O11405",
  mplus: "123",
  nma: "22140",
  cooper: "object-5813",
  popular: "met:45734",
};

const DISPLAY: Record<BenchSource, string> = {
  met: "The Metropolitan Museum of Art",
  artic: "Art Institute of Chicago",
  harvard: "Harvard Art Museums",
  cleveland: "Cleveland Museum of Art",
  whitney: "Whitney Museum of American Art",
  rijks: "Rijksmuseum",
  ngl: "National Gallery, London",
  getty: "J. Paul Getty Museum",
  vam: "Victoria and Albert Museum",
  mplus: "M+ Museum",
  nma: "National Museum of Australia",
  cooper: "Cooper Hewitt, Smithsonian Design Museum",
  popular: "Popular artists (composite pool)",
};

function median(nums: number[]): number {
  if (nums.length === 0) return NaN;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

async function fetchOne(
  source: BenchSource,
  objectId: string,
): Promise<WallSlotPayload | null> {
  switch (source) {
    case "met":
      return fetchMetObject(objectId);
    case "artic":
      return fetchArticArtwork(objectId);
    case "harvard":
      return fetchHarvardObject(objectId);
    case "cleveland":
      return fetchClevelandArtwork(objectId);
    case "whitney":
      return fetchWhitneyArtwork(objectId);
    case "rijks":
      return fetchRijksArtwork(objectId);
    case "ngl":
      return fetchNglObject(objectId);
    case "getty":
      return fetchGettyArtwork(objectId);
    case "vam":
      return fetchVamObject(objectId);
    case "mplus":
      return fetchMplusArtwork(objectId);
    case "nma":
      return fetchNmaObject(objectId);
    case "cooper":
      return fetchCooperObject(objectId);
    case "popular":
      return fetchPopularCompositeUnderlying(objectId);
    default:
      return null;
  }
}

const SOURCES = [
  "met",
  "artic",
  "harvard",
  "cleveland",
  "whitney",
  "rijks",
  "ngl",
  "getty",
  "vam",
  "mplus",
  "nma",
  "cooper",
  "popular",
] as const satisfies readonly BenchSource[];

async function resolveTestId(
  prisma: PrismaClient | null,
  source: BenchSource,
): Promise<string> {
  if (prisma) {
    try {
      const row = await prisma.artPoolEntry.findFirst({
        where: { source },
        select: { objectId: true },
      });
      if (row?.objectId?.trim()) return row.objectId.trim();
    } catch {
      /* use fallback */
    }
  }
  return FALLBACK_ID[source];
}

/** Prefer pool ID; if that cannot produce a card, use the static fallback. */
async function resolveWorkingId(
  prisma: PrismaClient | null,
  source: BenchSource,
): Promise<string> {
  const primary = await resolveTestId(prisma, source);
  const trySlot = await fetchOne(source, primary);
  if (trySlot) return primary;
  const fb = FALLBACK_ID[source];
  if (fb !== primary && (await fetchOne(source, fb))) return fb;
  return primary;
}

async function main() {
  let prisma: PrismaClient | null = null;
  try {
    prisma = new PrismaClient();
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    prisma = null;
    console.log(
      "(No DATABASE_URL / Prisma — using built-in fallback object IDs.)\n",
    );
  }

  const rows: Array<{
    source: BenchSource;
    name: string;
    objectId: string;
    ok: boolean;
    medianMs: number;
    minMs: number;
    maxMs: number;
    note?: string;
  }> = [];

  for (const source of SOURCES) {
    if (source === "harvard" && !isHarvardConfigured()) {
      rows.push({
        source,
        name: DISPLAY[source],
        objectId: "—",
        ok: false,
        medianMs: NaN,
        minMs: NaN,
        maxMs: NaN,
        note: "skipped (set HARVARD_ART_API_KEY)",
      });
      continue;
    }

    const objectId = await resolveWorkingId(prisma, source);
    const times: number[] = [];

    for (let w = 0; w < WARMUP; w++) {
      await fetchOne(source, objectId);
    }

    let anyOk = false;
    for (let i = 0; i < REPEATS; i++) {
      const t0 = performance.now();
      const slot = await fetchOne(source, objectId);
      const ms = performance.now() - t0;
      times.push(ms);
      if (slot != null) anyOk = true;
      if (i < REPEATS - 1 && GAP_MS > 0) await sleep(GAP_MS);
    }

    rows.push({
      source,
      name: DISPLAY[source],
      objectId,
      ok: anyOk,
      medianMs: median(times),
      minMs: Math.min(...times),
      maxMs: Math.max(...times),
      note: anyOk ? undefined : "returned null (check ID / API)",
    });
  }

  if (prisma) await prisma.$disconnect();

  console.log(
    `One artwork fetch per source (${REPEATS} timed runs each, same objectId; median / min–max ms).`,
  );
  if (GAP_MS > 0) {
    console.log(`Gap between runs: ${GAP_MS} ms (set BENCHMARK_GAP_MS=0 to disable; Cooper Hewitt needs ~1 req/s).\n`);
  } else {
    console.log();
  }

  const nameW = Math.max(...rows.map((r) => r.name.length));
  for (const r of rows) {
    const pad = (s: string, w: number) => s + " ".repeat(Math.max(0, w - s.length));
    if (!r.ok || Number.isNaN(r.medianMs)) {
      console.log(
        `${pad(r.name, nameW)}  ${r.objectId.padEnd(22)}  ${r.note ?? "FAIL"}`,
      );
      continue;
    }
    const med = r.medianMs.toFixed(0);
    const span = `${r.minMs.toFixed(0)}–${r.maxMs.toFixed(0)}`;
    console.log(
      `${pad(r.name, nameW)}  ${r.objectId.padEnd(22)}  ${med.padStart(6)} ms  (${span} ms)`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
