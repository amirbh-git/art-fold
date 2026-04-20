import { POPULAR_ARTIST_NAMES } from "@/lib/art-sources/popular-artists";
import { collectArticObjectIdsForPopularPool } from "@/lib/art-sources/artic";
import { collectClevelandObjectIdsForPopularPool } from "@/lib/art-sources/cleveland";
import { collectCooperObjectIdsForPopularPool } from "@/lib/art-sources/cooper";
import { collectGettyObjectIdsForPopularPool } from "@/lib/art-sources/getty";
import { collectHarvardObjectIdsForPopularPool } from "@/lib/art-sources/harvard";
import { collectMetObjectIdsForPopularPool } from "@/lib/art-sources/met";
import { collectMplusObjectIdsForPopularPool } from "@/lib/art-sources/mplus";
import { collectNglObjectIdsForPopularPool } from "@/lib/art-sources/ngl";
import { collectNmaObjectIdsForPopularPool } from "@/lib/art-sources/nma";
import { collectRijksObjectIdsForPopularPool } from "@/lib/art-sources/rijks";
import { collectVamObjectIdsForPopularPool } from "@/lib/art-sources/vam";
import { collectWhitneyObjectIdsForPopularPool } from "@/lib/art-sources/whitney";
import type { PopularPoolIngestRow } from "@/lib/art-sources/popular-pool-types";

const NAMES = POPULAR_ARTIST_NAMES;

/** Max `ArtPoolEntry` rows per canonical `poolArtist` string in the merged popular ingest. */
const POPULAR_POOL_MAX_WORKS_PER_ARTIST = 500;

export type PopularPoolCollectOptions = {
  /** Skip Met (slow per-object fetches). CLI: `--popular-skip-met`. Env: `POPULAR_POOL_SKIP_MET=1`. */
  skipMet?: boolean;
  /** Skip Rijksmuseum (slow per-object fetches). CLI: `--popular-skip-rijks`. Env: `POPULAR_POOL_SKIP_RIJK=1`. */
  skipRijks?: boolean;
};

function popularPoolEnvSkip(name: string): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/**
 * Merges rows from all museums. Same `compositeObjectId` from two APIs keeps **first** artist
 * (ingest order: Met → AIC → … → Cooper). At most {@link POPULAR_POOL_MAX_WORKS_PER_ARTIST} rows
 * per `poolArtist` after deduping by composite id.
 */
function mergeRows(
  target: Map<string, string>,
  perArtistCounts: Map<string, number>,
  rows: readonly PopularPoolIngestRow[],
): void {
  for (const r of rows) {
    if (!r.compositeObjectId) continue;
    if (target.has(r.compositeObjectId)) continue;
    const artist = r.poolArtist;
    const n = perArtistCounts.get(artist) ?? 0;
    if (n >= POPULAR_POOL_MAX_WORKS_PER_ARTIST) continue;
    perArtistCounts.set(artist, n + 1);
    target.set(r.compositeObjectId, artist);
  }
}

/**
 * Rows for `ArtPoolEntry` with `source = "popular"` and `poolArtist` set (canonical list string).
 */
export async function collectPopularPoolRows(
  options?: PopularPoolCollectOptions,
): Promise<PopularPoolIngestRow[]> {
  const byComposite = new Map<string, string>();
  const perArtistCounts = new Map<string, number>();
  const skipMet =
    options?.skipMet === true || popularPoolEnvSkip("POPULAR_POOL_SKIP_MET");
  const skipRijks =
    options?.skipRijks === true || popularPoolEnvSkip("POPULAR_POOL_SKIP_RIJK");

  const logAdd = async (
    label: string,
    fn: () => Promise<PopularPoolIngestRow[]>,
  ) => {
    const before = byComposite.size;
    console.log(`Popular pool: ${label}…`);
    mergeRows(byComposite, perArtistCounts, await fn());
    console.log(`  → +${byComposite.size - before} composite keys`);
  };

  const logSkip = (label: string, reason: string) => {
    console.log(`Popular pool: skipping ${label} (${reason})`);
  };

  if (!skipMet) {
    await logAdd("Met (ArtistOrCulture)", () =>
      collectMetObjectIdsForPopularPool(NAMES),
    );
  } else {
    logSkip(
      "Met",
      "`--popular-skip-met` or POPULAR_POOL_SKIP_MET",
    );
  }
  await logAdd("Art Institute of Chicago", () =>
    collectArticObjectIdsForPopularPool(NAMES),
  );
  await logAdd("Cleveland", () => collectClevelandObjectIdsForPopularPool(NAMES));
  await logAdd("Harvard", () => collectHarvardObjectIdsForPopularPool(NAMES));
  await logAdd("Whitney (collection scan)", () =>
    collectWhitneyObjectIdsForPopularPool(NAMES),
  );
  if (!skipRijks) {
    await logAdd("Rijksmuseum", () => collectRijksObjectIdsForPopularPool(NAMES));
  } else {
    logSkip(
      "Rijksmuseum",
      "`--popular-skip-rijks` or POPULAR_POOL_SKIP_RIJK",
    );
  }
  await logAdd("National Gallery, London", () =>
    collectNglObjectIdsForPopularPool(NAMES),
  );
  await logAdd("Getty (SPARQL)", () => collectGettyObjectIdsForPopularPool(NAMES));
  await logAdd("V&A", () => collectVamObjectIdsForPopularPool(NAMES));
  await logAdd("M+ (constituent scan)", () =>
    collectMplusObjectIdsForPopularPool(NAMES),
  );
  await logAdd("National Museum of Australia", () =>
    collectNmaObjectIdsForPopularPool(NAMES),
  );
  await logAdd("Cooper Hewitt", () => collectCooperObjectIdsForPopularPool(NAMES));

  console.log(`Popular pool: total unique composite keys: ${byComposite.size}`);
  return [...byComposite.entries()].map(([compositeObjectId, poolArtist]) => ({
    compositeObjectId,
    poolArtist,
  }));
}
