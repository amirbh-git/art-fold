import { mkdirSync, writeFileSync, writeSync } from "node:fs";
import { dirname, isAbsolute, resolve as resolvePath } from "node:path";

import { artPoolCount, pickRandomObjectIdsFromPool } from "@/lib/art-pool";
import type { ArtPoolIngestRow } from "@/lib/art-sources/art-pool-ingest";
import type { PopularPoolIngestRow } from "@/lib/art-sources/popular-pool-types";
import { popularPoolSearchHitMatchesArtist } from "@/lib/art-sources/popular-pool-search-hit-match";
import { SEARCH_TERMS } from "./search-keywords";
import type { WallSlotPayload } from "./types";

const MET_BASE = "https://collectionapi.metmuseum.org/public/collection/v1";

/** Used when `MET_HTTP_USER_AGENT` is unset so Incapsula is less likely to return HTML 403. */
const MET_DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function metCollectionApiHeaders(): Record<string, string> {
  return {
    Accept: "application/json",
    "User-Agent":
      process.env.MET_HTTP_USER_AGENT?.trim() || MET_DEFAULT_USER_AGENT,
    "Accept-Language":
      process.env.MET_HTTP_ACCEPT_LANGUAGE?.trim() || "en-US,en;q=0.9",
    Referer: "https://www.metmuseum.org/",
  };
}

let metPoolLoggedFirstNonJson = false;

function metPoolMaybeLogFirstNonJson(status: number, ct: string, bodyStart: string): void {
  if (metPoolLoggedFirstNonJson) return;
  metPoolLoggedFirstNonJson = true;
  const snippet = bodyStart.replace(/\s+/g, " ").slice(0, 140);
  metPoolProgressLog(
    `met pool: first non-JSON object response (HTTP ${status}, content-type: ${ct || "(missing)"}; body starts: ${snippet}) — if this looks like HTML, lower MET_POOL_ARTIST_CONCURRENCY, raise MET_POOL_ARTIST_DELAY_MS, or run from another network; override identity with MET_HTTP_USER_AGENT.`,
  );
}

/**
 * Line-buffered progress for long Met pool runs (visible under `| tee` / CI).
 * Override log interval with `MET_POOL_PROGRESS_EVERY_BATCHES` (enrichment batches).
 */
function metPoolProgressLog(line: string): void {
  const msg = `[${new Date().toISOString()}] ${line}\n`;
  try {
    writeSync(1, msg);
  } catch {
    console.log(line);
  }
}

type MetSearchResponse = {
  total?: number;
  objectIDs?: number[];
};

type MetConstituent = {
  role?: string;
  name?: string;
};

type MetObjectDetail = {
  objectID?: number;
  title?: string;
  artistDisplayName?: string;
  /** When `artistDisplayName` is empty, Met often still fills this (e.g. "Gogh, Vincent van"). */
  artistAlphaSort?: string;
  /** Qualifier before the name ("After", "Possibly by", …). */
  artistPrefix?: string;
  /** Extra qualifier after the name ("verso only", …). */
  artistSuffix?: string;
  primaryImage?: string;
  primaryImageSmall?: string;
  objectURL?: string;
  objectDate?: string;
  medium?: string;
  dimensions?: string;
  department?: string;
  creditLine?: string;
  artistDisplayBio?: string;
  /** Named agents (Artist, Maker, etc.) when `artistDisplayName` is empty. */
  constituents?: MetConstituent[];
  /** Attribution for anonymous / workshop works (often shown on the Met website). */
  culture?: string;
  dynasty?: string;
  period?: string;
  reign?: string;
  /** Present when the object was removed or the id is invalid. */
  message?: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

/**
 * Targeted seeds (plus shared `SEARCH_TERMS`) so the pool spans paintings, works on
 * canvas, drawings, oil, photographs, watercolors, prints, etc. Uses `medium` where
 * the API supports it (Met classification names like Paintings, Prints).
 * @see https://metmuseum.github.io/
 */
const MET_POOL_EXTRA_SEEDS: ReadonlyArray<{ q: string; medium?: string }> = [
  { q: "painting", medium: "Paintings" },
  { q: "paintings", medium: "Paintings" },
  { q: "canvas" },
  { q: "canvas", medium: "Paintings" },
  { q: "oil on canvas" },
  { q: "drawing" },
  { q: "drawings", medium: "Drawings" },
  { q: "oil" },
  { q: "oil paint" },
  { q: "oil painting" },
  { q: "photograph", medium: "Photographs" },
  { q: "photography", medium: "Photographs" },
  { q: "watercolor" },
  { q: "watercolors" },
  { q: "gouache", medium: "Paintings" },
  { q: "print" },
  { q: "prints", medium: "Prints" },
  { q: "etching", medium: "Prints" },
  { q: "lithograph", medium: "Prints" },
  { q: "the", medium: "Paintings" },
  { q: "the", medium: "Prints" },
  { q: "the", medium: "Drawings" },
  { q: "the", medium: "Photographs" },
  { q: "a", medium: "Paintings" },
  { q: "portrait", medium: "Paintings" },
  { q: "landscape", medium: "Paintings" },
  { q: "figure", medium: "Drawings" },
  { q: "still life", medium: "Paintings" },
  { q: "pastel", medium: "Drawings" },
  { q: "fresco" },
  { q: "fresco", medium: "Paintings" },
  { q: "tempera" },
  { q: "tempera", medium: "Paintings" },
  { q: "sketch" },
  { q: "sketch", medium: "Drawings" },
  { q: "study" },
  { q: "study", medium: "Drawings" },
  { q: "miniature", medium: "Paintings" },
  { q: "portrait", medium: "Prints" },
  { q: "landscape", medium: "Prints" },
  { q: "seascape", medium: "Paintings" },
  { q: "interior", medium: "Paintings" },
  { q: "animal", medium: "Paintings" },
  { q: "flower", medium: "Paintings" },
  { q: "battle", medium: "Paintings" },
  { q: "religious", medium: "Paintings" },
  { q: "mythology" },
  { q: "allegory", medium: "Paintings" },
  { q: "genre", medium: "Paintings" },
  { q: "illuminated" },
  { q: "silver" },
  { q: "gold" },
  { q: "ivory" },
  { q: "velvet" },
];

/** Curated departments for 2D-focused pool expansion (see /departments). */
const MET_DEPARTMENT_SCOPES: ReadonlyArray<{
  departmentId: number;
  q: string;
  medium?: string;
}> = [
  { departmentId: 9, q: "the" },
  { departmentId: 9, q: "portrait" },
  { departmentId: 9, q: "landscape" },
  { departmentId: 9, q: "drawing" },
  { departmentId: 9, q: "print" },
  { departmentId: 9, q: "figure" },
  { departmentId: 11, q: "the" },
  { departmentId: 11, q: "portrait" },
  { departmentId: 11, q: "landscape" },
  { departmentId: 11, q: "oil" },
  { departmentId: 11, q: "still life" },
  { departmentId: 19, q: "the" },
  { departmentId: 19, q: "portrait" },
  { departmentId: 19, q: "photograph" },
  { departmentId: 19, q: "landscape" },
  { departmentId: 21, q: "the" },
  { departmentId: 21, q: "portrait" },
  { departmentId: 21, q: "figure" },
  { departmentId: 21, q: "abstract" },
];

/** `dateBegin` / `dateEnd` must both be set; pairs with broad `q` to slice eras. */
const MET_DATE_SLICES: ReadonlyArray<{
  dateBegin: number;
  dateEnd: number;
  q: string;
}> = [
  { dateBegin: -800, dateEnd: 500, q: "the" },
  { dateBegin: 1300, dateEnd: 1500, q: "the" },
  { dateBegin: 1500, dateEnd: 1700, q: "the" },
  { dateBegin: 1700, dateEnd: 1800, q: "the" },
  { dateBegin: 1800, dateEnd: 1900, q: "the" },
  { dateBegin: 1900, dateEnd: 1950, q: "the" },
  { dateBegin: 1950, dateEnd: 2020, q: "the" },
  { dateBegin: 1800, dateEnd: 1900, q: "portrait" },
  { dateBegin: 1850, dateEnd: 1950, q: "landscape" },
  { dateBegin: 1600, dateEnd: 1800, q: "drawing" },
];

/**
 * Extra queries for Title-only / Tags-only / ArtistOrCulture-only searches.
 * API uses PascalCase booleans (`Title`, `Tags`, `ArtistOrCulture`); lowercase breaks results.
 */
const MET_FLAG_SEED_QUERIES: ReadonlyArray<{ q: string; medium?: string }> = [
  { q: "portrait" },
  { q: "landscape" },
  { q: "figure" },
  { q: "flowers" },
  { q: "battle" },
  { q: "Madonna" },
  { q: "Christ" },
  { q: "still life" },
  { q: "seascape" },
  { q: "interior" },
  { q: "Japanese" },
  { q: "Chinese" },
  { q: "Dutch" },
  { q: "French" },
  { q: "American" },
  { q: "Italian" },
  { q: "Under the Wave" },
  { q: "Kanagawa" },
  { q: "Rembrandt" },
  { q: "Hokusai" },
  { q: "Degas" },
  { q: "Van Gogh" },
];

export type MetSearchQuery = {
  q: string;
  medium?: string;
  departmentId?: number;
  dateBegin?: number;
  dateEnd?: number;
  /** Sets `Title=true` (title-field search). */
  titleOnly?: boolean;
  /** Sets `Tags=true` (subject keyword tags). */
  tagsOnly?: boolean;
  /** Sets `ArtistOrCulture=true`. */
  artistOrCultureOnly?: boolean;
};

function buildMetSearchParams(query: MetSearchQuery): URLSearchParams {
  const params = new URLSearchParams();
  params.set("q", query.q);
  params.set("hasImages", "true");
  if (query.medium?.trim()) params.set("medium", query.medium.trim());
  if (query.departmentId != null) {
    params.set("departmentId", String(query.departmentId));
  }
  if (query.dateBegin != null && query.dateEnd != null) {
    params.set("dateBegin", String(query.dateBegin));
    params.set("dateEnd", String(query.dateEnd));
  }
  if (query.titleOnly) params.set("Title", "true");
  if (query.tagsOnly) params.set("Tags", "true");
  if (query.artistOrCultureOnly) params.set("ArtistOrCulture", "true");
  return params;
}

async function metSearchObjectIdsOnce(
  query: MetSearchQuery,
): Promise<number[] | null> {
  const params = buildMetSearchParams(query);
  const res = await fetch(`${MET_BASE}/search?${params}`, {
    cache: "no-store",
    headers: metCollectionApiHeaders(),
  });
  const text = await res.text();
  const ct = res.headers.get("content-type") ?? "";
  const looksJson =
    ct.toLowerCase().includes("application/json") || text.trimStart().startsWith("{");
  if (!res.ok || !looksJson) return null;
  try {
    const json = JSON.parse(text) as MetSearchResponse;
    const ids = json.objectIDs ?? [];
    return ids.filter((id) => typeof id === "number" && Number.isFinite(id));
  } catch {
    return null;
  }
}

/** Retries on empty HTML/error pages from the CDN (common under load). */
async function metSearchObjectIdsFromQuery(
  query: MetSearchQuery,
): Promise<number[]> {
  const delays = [0, 250, 800, 2000];
  for (let attempt = 0; attempt < delays.length; attempt++) {
    if (delays[attempt]! > 0) await sleep(delays[attempt]!);
    const ids = await metSearchObjectIdsOnce(query);
    if (ids !== null) return ids;
  }
  return [];
}

async function metSearchObjectIds(
  q: string,
  medium?: string,
): Promise<number[]> {
  return metSearchObjectIdsFromQuery({ q, medium });
}

function metIsUnknownName(s: string): boolean {
  const t = s.trim().toLowerCase();
  return t === "" || t === "unknown" || t === "anonymous";
}

/**
 * Met Collection API: `artistDisplayName` + `artistPrefix` / `artistSuffix` / `artistAlphaSort`;
 * then `constituents`; then culture/period — see https://metmuseum.github.io/
 */
function metArtistDisplayLine(o: MetObjectDetail): string {
  const prefix = (o.artistPrefix ?? "").trim();
  const display = (o.artistDisplayName ?? "").trim();
  const alpha = (o.artistAlphaSort ?? "").trim();
  const suffix = (o.artistSuffix ?? "").trim();
  const core = !metIsUnknownName(display) ? display : !metIsUnknownName(alpha) ? alpha : "";
  const headParts: string[] = [];
  if (prefix) headParts.push(prefix);
  if (core) headParts.push(core);
  if (suffix) headParts.push(suffix);
  const combined = headParts.join(" ").replace(/\s+/g, " ").trim();
  if (combined) {
    const coreUnknown = !core || metIsUnknownName(core);
    if (!coreUnknown || prefix || suffix) return combined;
  }

  const cons = o.constituents;
  if (Array.isArray(cons) && cons.length > 0) {
    const preferredRoles =
      /^(artist|maker|architect|designer|modeler|manufacturer|publisher|engraver|etcher|draftsman|draftsperson|lithographer|silversmith|goldsmith|weaver|carver|sculptor|painter|printmaker|author|calligrapher|patron)/i;
    const skipRole = /^(previous owner|vendor|donor|seller)$/i;
    const preferred = cons
      .filter(
        (c) =>
          c &&
          typeof c.name === "string" &&
          c.name.trim() &&
          !metIsUnknownName(c.name) &&
          preferredRoles.test(String(c.role ?? "")),
      )
      .map((c) => c.name!.trim());
    if (preferred.length > 0) return [...new Set(preferred)].join("; ");

    const anyNamed = cons
      .filter((c) => c && typeof c.name === "string" && c.name.trim() && !skipRole.test(String(c.role ?? "")))
      .map((c) => c!.name!.trim())
      .filter((n) => !metIsUnknownName(n));
    if (anyNamed.length > 0) return [...new Set(anyNamed)].join("; ");
  }

  const bits: string[] = [];
  for (const v of [o.culture, o.dynasty, o.period, o.reign]) {
    const t = (v ?? "").trim();
    if (t) bits.push(t);
  }
  if (bits.length > 0) return bits.join("; ");

  return "";
}

function metPoolObjectFetchAttempts(): number {
  const raw = process.env.MET_POOL_OBJECT_FETCH_ATTEMPTS?.trim();
  if (raw === undefined || raw === "") return 8;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 20) : 8;
}

function metPoolObjectFetchBackoffMs(status: number, attemptIndex: number): number {
  const blocked = status === 403 || status === 429 || status >= 500;
  const base = blocked ? 2_200 : 900;
  return base + attemptIndex * 1_100;
}

async function fetchMetObjectDetailForPool(
  objectId: string,
): Promise<MetObjectDetail | null> {
  const url = `${MET_BASE}/objects/${encodeURIComponent(objectId)}`;
  const headers = metCollectionApiHeaders();
  const maxAttempts = metPoolObjectFetchAttempts();
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, { cache: "no-store", headers });
    } catch {
      await sleep(1_000 + attempt * 800);
      continue;
    }
    const text = await res.text();
    const ct = res.headers.get("content-type") ?? "";
    const looksJson =
      ct.toLowerCase().includes("application/json") || text.trimStart().startsWith("{");
    if (!looksJson) {
      metPoolMaybeLogFirstNonJson(res.status, ct, text);
      if (attempt + 1 < maxAttempts) {
        await sleep(metPoolObjectFetchBackoffMs(res.status, attempt));
      }
      continue;
    }
    let o: MetObjectDetail;
    try {
      o = JSON.parse(text) as MetObjectDetail;
    } catch {
      await sleep(400 + attempt * 500);
      continue;
    }
    if (typeof o.message === "string" && o.message.trim()) {
      if (res.status === 404) return null;
      if (attempt + 1 < maxAttempts) {
        await sleep(metPoolObjectFetchBackoffMs(res.status, attempt));
      }
      continue;
    }
    if (!res.ok) {
      if (res.status === 404) return null;
      if (res.status === 403 || res.status === 429 || res.status >= 500) {
        if (attempt + 1 < maxAttempts) {
          await sleep(metPoolObjectFetchBackoffMs(res.status, attempt));
        }
        continue;
      }
      return null;
    }
    return o;
  }
  return null;
}

/**
 * Search only returns numeric IDs; `poolArtist` needs a per-object fetch.
 * Tune with `MET_POOL_ARTIST_CONCURRENCY` (default 3) and `MET_POOL_ARTIST_DELAY_MS` (default 250).
 * Object fetches: `MET_POOL_OBJECT_FETCH_ATTEMPTS` (default 8), headers via `MET_HTTP_USER_AGENT` / `MET_HTTP_ACCEPT_LANGUAGE`.
 */
function metPoolProgressEveryBatches(): number {
  const raw = process.env.MET_POOL_PROGRESS_EVERY_BATCHES?.trim();
  if (raw === undefined || raw === "") return 5;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 500) : 5;
}

/** Fewer search queries for smoke tests (`MET_POOL_QUICK_SEARCH=1`). */
function metPoolQuickSearch(): boolean {
  const v = process.env.MET_POOL_QUICK_SEARCH?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** After the union, keep only `ceil(n * fraction)` ids (smallest object ids first). */
function metPoolTestFraction(): number | null {
  const raw = process.env.MET_POOL_TEST_FRACTION?.trim();
  if (raw === undefined || raw === "") return null;
  const f = Number.parseFloat(raw);
  if (!Number.isFinite(f) || f <= 0 || f > 1) return null;
  return f;
}

/** After the union, keep at most this many ids (sorted ascending). Overrides fraction if both set. */
function metPoolMaxIdsEnv(): number | null {
  const raw = process.env.MET_POOL_MAX_IDS?.trim();
  if (raw === undefined || raw === "") return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1 ? n : null;
}

async function enrichMetPoolArtistRows(ids: number[]): Promise<ArtPoolIngestRow[]> {
  const concurrency = Math.min(
    20,
    Math.max(
      1,
      Number.parseInt(process.env.MET_POOL_ARTIST_CONCURRENCY ?? "3", 10) || 3,
    ),
  );
  const delayMs = Math.max(
    0,
    Number.parseInt(process.env.MET_POOL_ARTIST_DELAY_MS ?? "250", 10) || 0,
  );
  const total = ids.length;
  const progressEvery = metPoolProgressEveryBatches();
  metPoolProgressLog(
    `met pool: enriching ${total.toLocaleString()} object ids for poolArtist (concurrency=${concurrency}, delayMs=${delayMs}; progress every ${progressEvery} batch(es); tune via MET_POOL_ARTIST_CONCURRENCY / MET_POOL_ARTIST_DELAY_MS)`,
  );

  const out: ArtPoolIngestRow[] = [];
  let batchesDone = 0;
  let cumOk = 0;
  let cumWithArtist = 0;
  for (let base = 0; base < ids.length; base += concurrency) {
    const slice = ids.slice(base, base + concurrency);
    let details: (MetObjectDetail | null)[];
    try {
      details = await Promise.all(
        slice.map((id) => fetchMetObjectDetailForPool(String(id))),
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      metPoolProgressLog(
        `met pool: FATAL — object detail batch failed at offset ${base} (ids ${slice[0]}…): ${msg}`,
      );
      throw e;
    }
    for (let i = 0; i < slice.length; i++) {
      const id = slice[i]!;
      const o = details[i];
      const artist = o ? metArtistDisplayLine(o).trim() || null : null;
      out.push({ objectId: String(id), poolArtist: artist });
      if (o) cumOk++;
      if (artist) cumWithArtist++;
    }
    batchesDone++;
    const done = Math.min(base + concurrency, total);
    if (batchesDone % progressEvery === 0 || done === total) {
      let batchOk = 0;
      let batchWithArtist = 0;
      for (const d of details) {
        if (d) batchOk++;
        if (d && metArtistDisplayLine(d).trim()) batchWithArtist++;
      }
      const pct = ((done / total) * 100).toFixed(1);
      const cumPct = done > 0 ? ((cumOk / done) * 100).toFixed(1) : "0.0";
      const cumArtPct = done > 0 ? ((cumWithArtist / done) * 100).toFixed(1) : "0.0";
      metPoolProgressLog(
        `met pool: enrich ${done.toLocaleString()}/${total.toLocaleString()} (${pct}%) — cumulative JSON ok ${cumOk}/${done} (${cumPct}%), artist ${cumWithArtist}/${done} (${cumArtPct}%); last batch ${batchOk}/${details.length} JSON, ${batchWithArtist}/${details.length} artist`,
      );
    }
    if (delayMs > 0) await sleep(delayMs);
  }
  metPoolProgressLog(
    `met pool: enrich complete — ${out.length.toLocaleString()} rows (next: insert into DB)`,
  );
  return out;
}

/**
 * Parse a Met id list file: one integer per line (# comments allowed), a JSON array of numbers,
 * or `{"objectIDs":[1,2,…]}` (Met search response shape).
 */
export function parseMetPoolIdsFromFileContent(content: string): number[] {
  const trimmed = content.replace(/^\uFEFF/, "").trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed
          .map((x) => (typeof x === "number" ? x : Number.parseInt(String(x), 10)))
          .filter((n) => Number.isFinite(n) && n > 0)
          .map((n) => Math.floor(n));
      }
      if (parsed && typeof parsed === "object" && "objectIDs" in parsed) {
        const raw = (parsed as { objectIDs?: unknown }).objectIDs;
        if (!Array.isArray(raw)) return [];
        return raw
          .map((x) => (typeof x === "number" ? x : Number.parseInt(String(x), 10)))
          .filter((n) => Number.isFinite(n) && n > 0)
          .map((n) => Math.floor(n));
      }
    } catch {
      return [];
    }
  }
  const out: number[] = [];
  for (const line of trimmed.split(/\r?\n/)) {
    const s = line.replace(/#.*$/, "").trim();
    if (!s) continue;
    const n = Number.parseInt(s, 10);
    if (Number.isFinite(n) && n > 0) out.push(Math.floor(n));
  }
  return out;
}

function writeMetPoolIdSnapshotIfRequested(ids: readonly number[]): void {
  const raw = process.env.MET_POOL_SAVE_ID_LIST?.trim();
  if (!raw) return;
  const outPath = isAbsolute(raw) ? raw : resolvePath(process.cwd(), raw);
  const dir = dirname(outPath);
  if (dir && dir !== "." && dir !== outPath) mkdirSync(dir, { recursive: true });
  writeFileSync(
    outPath,
    `${JSON.stringify({ version: 1, objectIDs: [...ids] }, null, 0)}\n`,
    "utf8",
  );
  metPoolProgressLog(
    `met pool: wrote id snapshot (${ids.length.toLocaleString()} ids) → ${outPath} (re-run enrichment only: npm run art-pool:build -- --only met --met-enrich-only --met-id-file <path>)`,
  );
}

/** Dedupe, sort, then run per-object Met API fetches for `poolArtist` (no search phases). */
export async function enrichMetPoolRowsForObjectIds(
  ids: readonly number[],
): Promise<ArtPoolIngestRow[]> {
  const uniq = new Set<number>();
  for (const id of ids) {
    if (typeof id === "number" && Number.isFinite(id) && id > 0) uniq.add(Math.floor(id));
  }
  const sorted = [...uniq].sort((a, b) => a - b);
  metPoolProgressLog(
    `met pool: enrich-only — ${sorted.length.toLocaleString()} unique object ids (skipping search phases)`,
  );
  return enrichMetPoolArtistRows(sorted);
}

export async function fetchMetObject(
  objectId: string,
): Promise<WallSlotPayload | null> {
  const res = await fetch(
    `${MET_BASE}/objects/${encodeURIComponent(objectId)}`,
    {
      next: { revalidate: 3600 },
      headers: metCollectionApiHeaders(),
    },
  );
  if (!res.ok) return null;
  const text = await res.text();
  let o: MetObjectDetail;
  try {
    o = JSON.parse(text) as MetObjectDetail;
  } catch {
    return null;
  }
  if (typeof o.message === "string" && o.message.trim()) return null;
  const img = o.primaryImage?.trim() || o.primaryImageSmall?.trim();
  if (!img) return null;
  const oid = o.objectID;
  if (oid == null) return null;
  const sid = String(oid);
  return {
    source: "met",
    objectId: sid,
    title: (o.title ?? "Untitled").trim() || "Untitled",
    artist: metArtistDisplayLine(o),
    imageUrl: img,
    objectUrl:
      (o.objectURL ?? "").trim() ||
      `https://www.metmuseum.org/art/collection/search/${sid}`,
    objectDate: (o.objectDate ?? "").trim() || undefined,
    medium: (o.medium ?? "").trim() || undefined,
    dimensions: (o.dimensions ?? "").trim() || undefined,
    department: (o.department ?? "").trim() || undefined,
    creditLine: (o.creditLine ?? "").trim() || undefined,
    artistBio: (o.artistDisplayBio ?? "").trim() || undefined,
  };
}

/**
 * Unions many search queries (`hasImages=true`) to reach a large eligible ID set
 * (typically 10k+). Each Met search returns all matching IDs in one response.
 */
export async function collectMetObjectIdsForPool(): Promise<ArtPoolIngestRow[]> {
  const all = new Set<number>();
  const quick = metPoolQuickSearch();
  const extraSeeds = quick
    ? MET_POOL_EXTRA_SEEDS.slice(0, 5)
    : MET_POOL_EXTRA_SEEDS;
  const searchTerms = quick ? SEARCH_TERMS.slice(0, 15) : SEARCH_TERMS;
  const deptScopes = quick
    ? MET_DEPARTMENT_SCOPES.slice(0, 6)
    : MET_DEPARTMENT_SCOPES;
  const dateSlices = quick ? MET_DATE_SLICES.slice(0, 3) : MET_DATE_SLICES;
  const flagSeeds = quick
    ? MET_FLAG_SEED_QUERIES.slice(0, 4)
    : MET_FLAG_SEED_QUERIES;

  if (quick) {
    metPoolProgressLog(
      "met pool: MET_POOL_QUICK_SEARCH=1 — reduced search surface (re-run full build without this for production union)",
    );
  }

  const ingest = async (ids: number[]): Promise<void> => {
    for (const id of ids) all.add(id);
  };

  const runSeed = async (q: string, medium?: string): Promise<void> => {
    try {
      const ids = await metSearchObjectIds(q, medium);
      await ingest(ids);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      metPoolProgressLog(`met pool: search FAILED seed q=${JSON.stringify(q)}: ${msg}`);
      throw e;
    }
    await sleep(35);
  };

  const runQuery = async (query: MetSearchQuery): Promise<void> => {
    try {
      const ids = await metSearchObjectIdsFromQuery(query);
      await ingest(ids);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      metPoolProgressLog(`met pool: search FAILED query q=${JSON.stringify(query.q)}: ${msg}`);
      throw e;
    }
    await sleep(35);
  };

  metPoolProgressLog(
    `met pool: phase 1/5 — extra seeds (${extraSeeds.length} queries)…`,
  );
  for (const seed of extraSeeds) {
    await runSeed(seed.q, seed.medium);
  }
  metPoolProgressLog(
    `met pool: phase 1 done — ${all.size.toLocaleString()} unique ids`,
  );

  metPoolProgressLog(
    `met pool: phase 2/5 — SEARCH_TERMS (${searchTerms.length} terms)…`,
  );
  let termIdx = 0;
  for (const term of searchTerms) {
    await runSeed(term);
    termIdx++;
    if (termIdx % 20 === 0 || termIdx === searchTerms.length) {
      metPoolProgressLog(
        `met pool: phase 2 … ${termIdx}/${searchTerms.length} terms — ${all.size.toLocaleString()} ids`,
      );
    }
  }
  metPoolProgressLog(
    `met pool: phase 2 done — ${all.size.toLocaleString()} unique ids`,
  );

  metPoolProgressLog(
    `met pool: phase 3/5 — department scopes (${deptScopes.length} queries)…`,
  );
  let depIdx = 0;
  for (const row of deptScopes) {
    await runQuery({
      q: row.q,
      medium: row.medium,
      departmentId: row.departmentId,
    });
    depIdx++;
    if (depIdx % 4 === 0 || depIdx === deptScopes.length) {
      metPoolProgressLog(
        `met pool: phase 3 … ${depIdx}/${deptScopes.length} — ${all.size.toLocaleString()} ids`,
      );
    }
  }
  metPoolProgressLog(
    `met pool: phase 3 done — ${all.size.toLocaleString()} unique ids`,
  );

  metPoolProgressLog(
    `met pool: phase 4/5 — date slices (${dateSlices.length} queries)…`,
  );
  let dateIdx = 0;
  for (const slice of dateSlices) {
    await runQuery({
      q: slice.q,
      dateBegin: slice.dateBegin,
      dateEnd: slice.dateEnd,
    });
    dateIdx++;
    metPoolProgressLog(
      `met pool: phase 4 … ${dateIdx}/${dateSlices.length} — ${all.size.toLocaleString()} ids`,
    );
  }
  metPoolProgressLog(
    `met pool: phase 4 done — ${all.size.toLocaleString()} unique ids`,
  );

  const flagQueries = flagSeeds.length * 3;
  metPoolProgressLog(
    `met pool: phase 5/5 — title/tags/artist flag searches (${flagQueries} requests)…`,
  );
  let fq = 0;
  for (const seed of flagSeeds) {
    await runQuery({ q: seed.q, medium: seed.medium, titleOnly: true });
    fq++;
    if (fq % 6 === 0 || fq === flagQueries) {
      metPoolProgressLog(
        `met pool: phase 5 … ${fq}/${flagQueries} — ${all.size.toLocaleString()} ids`,
      );
    }
    await runQuery({ q: seed.q, medium: seed.medium, tagsOnly: true });
    fq++;
    if (fq % 6 === 0 || fq === flagQueries) {
      metPoolProgressLog(
        `met pool: phase 5 … ${fq}/${flagQueries} — ${all.size.toLocaleString()} ids`,
      );
    }
    await runQuery({
      q: seed.q,
      medium: seed.medium,
      artistOrCultureOnly: true,
    });
    fq++;
    if (fq % 6 === 0 || fq === flagQueries) {
      metPoolProgressLog(
        `met pool: phase 5 … ${fq}/${flagQueries} — ${all.size.toLocaleString()} ids`,
      );
    }
  }
  metPoolProgressLog(
    `met pool: phase 5 done — ${all.size.toLocaleString()} unique ids (starting per-object enrichment)`,
  );

  let ids = [...all].sort((a, b) => a - b);
  const collected = ids.length;
  const maxCap = metPoolMaxIdsEnv();
  const frac = metPoolTestFraction();
  if (maxCap != null) {
    ids = ids.slice(0, Math.min(maxCap, ids.length));
  } else if (frac != null) {
    const n = Math.max(1, Math.ceil(ids.length * frac));
    ids = ids.slice(0, n);
  }
  if (ids.length < collected) {
    metPoolProgressLog(
      `met pool: id cap applied — enriching ${ids.length.toLocaleString()} of ${collected.toLocaleString()} collected (MET_POOL_MAX_IDS or MET_POOL_TEST_FRACTION)`,
    );
  }

  writeMetPoolIdSnapshotIfRequested(ids);
  return enrichMetPoolArtistRows(ids);
}

/** `ArtistOrCulture` search for each name — used by the cross-museum `popular` pool. */
export async function collectMetObjectIdsForPopularPool(
  artistNames: readonly string[],
): Promise<PopularPoolIngestRow[]> {
  const out: PopularPoolIngestRow[] = [];
  const seen = new Set<string>();
  for (const raw of artistNames) {
    const name = raw.trim();
    if (!name) continue;
    const ids = await metSearchObjectIdsFromQuery({
      q: name,
      artistOrCultureOnly: true,
    });
    for (const id of ids) {
      if (typeof id !== "number" || !Number.isFinite(id)) continue;
      const detail = await fetchMetObjectDetailForPool(String(id));
      if (!detail) continue;
      await sleep(25);
      const artistLine = metArtistDisplayLine(detail);
      if (!popularPoolSearchHitMatchesArtist(name, artistLine)) continue;
      const composite = `met:${id}`;
      if (seen.has(composite)) continue;
      seen.add(composite);
      out.push({ compositeObjectId: composite, poolArtist: name });
    }
    await sleep(35);
  }
  return out;
}

async function pickRandomMetId(exclude: Set<string>): Promise<string | null> {
  const seeds = [
    ...MET_POOL_EXTRA_SEEDS.map((s) => s.q),
    ...SEARCH_TERMS,
  ];
  for (let attempt = 0; attempt < 20; attempt++) {
    const q = seeds[Math.floor(Math.random() * seeds.length)]!;
    const useMedium =
      Math.random() < 0.35
        ? ["Paintings", "Prints", "Drawings", "Photographs"][
            Math.floor(Math.random() * 4)
          ]
        : undefined;
    const ids = await metSearchObjectIds(q, useMedium);
    if (ids.length === 0) continue;
    const candidates = [...ids];
    shuffleInPlace(candidates);
    for (const id of candidates) {
      const sid = String(id);
      if (!exclude.has(`met:${sid}`)) return sid;
    }
  }
  return null;
}

export async function getRandomMetSlots(
  count: number,
  excludeIds: Iterable<string>,
): Promise<WallSlotPayload[]> {
  const exclude = new Set(excludeIds);
  const out: WallSlotPayload[] = [];
  let guard = 0;
  const usePool = (await artPoolCount("met")) > 0;

  while (out.length < count && guard < count * 100) {
    guard++;
    const need = count - out.length;

    if (usePool) {
      const ids = await pickRandomObjectIdsFromPool("met", exclude, need);
      if (ids.length > 0) {
        const fetched = await Promise.all(
          ids.map((oid) => fetchMetObject(oid)),
        );
        for (let i = 0; i < fetched.length; i++) {
          const slot = fetched[i];
          const oid = ids[i]!;
          if (!slot) {
            exclude.add(`met:${oid}`);
            continue;
          }
          exclude.add(`met:${slot.objectId}`);
          out.push(slot);
        }
        continue;
      }
    }

    const id = await pickRandomMetId(exclude);
    if (!id) break;
    const slot = await fetchMetObject(id);
    if (!slot) {
      exclude.add(`met:${id}`);
      continue;
    }
    exclude.add(`met:${slot.objectId}`);
    out.push(slot);
  }

  return out;
}
