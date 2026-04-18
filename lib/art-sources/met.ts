import { artPoolCount, pickRandomObjectIdsFromPool } from "@/lib/art-pool";
import { SEARCH_TERMS } from "./search-keywords";
import type { WallSlotPayload } from "./types";

const MET_BASE = "https://collectionapi.metmuseum.org/public/collection/v1";

type MetSearchResponse = {
  total?: number;
  objectIDs?: number[];
};

type MetObjectDetail = {
  objectID?: number;
  title?: string;
  artistDisplayName?: string;
  primaryImage?: string;
  primaryImageSmall?: string;
  objectURL?: string;
  objectDate?: string;
  medium?: string;
  dimensions?: string;
  department?: string;
  creditLine?: string;
  artistDisplayBio?: string;
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
  });
  if (!res.ok) return null;
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) return null;
  const json = (await res.json()) as MetSearchResponse;
  const ids = json.objectIDs ?? [];
  return ids.filter((id) => typeof id === "number" && Number.isFinite(id));
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

export async function fetchMetObject(
  objectId: string,
): Promise<WallSlotPayload | null> {
  const res = await fetch(
    `${MET_BASE}/objects/${encodeURIComponent(objectId)}`,
    { next: { revalidate: 3600 } },
  );
  if (!res.ok) return null;
  const o = (await res.json()) as MetObjectDetail;
  const img = o.primaryImage?.trim() || o.primaryImageSmall?.trim();
  if (!img) return null;
  const oid = o.objectID;
  if (oid == null) return null;
  const sid = String(oid);
  return {
    source: "met",
    objectId: sid,
    title: (o.title ?? "Untitled").trim() || "Untitled",
    artist: (o.artistDisplayName ?? "").trim(),
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
export async function collectMetObjectIdsForPool(): Promise<number[]> {
  const all = new Set<number>();

  const ingest = async (ids: number[]): Promise<void> => {
    for (const id of ids) all.add(id);
  };

  const runSeed = async (q: string, medium?: string): Promise<void> => {
    const ids = await metSearchObjectIds(q, medium);
    await ingest(ids);
    await sleep(35);
  };

  const runQuery = async (query: MetSearchQuery): Promise<void> => {
    const ids = await metSearchObjectIdsFromQuery(query);
    await ingest(ids);
    await sleep(35);
  };

  for (const seed of MET_POOL_EXTRA_SEEDS) {
    await runSeed(seed.q, seed.medium);
  }

  for (const term of SEARCH_TERMS) {
    await runSeed(term);
  }

  for (const row of MET_DEPARTMENT_SCOPES) {
    await runQuery({
      q: row.q,
      medium: row.medium,
      departmentId: row.departmentId,
    });
  }

  for (const slice of MET_DATE_SLICES) {
    await runQuery({
      q: slice.q,
      dateBegin: slice.dateBegin,
      dateEnd: slice.dateEnd,
    });
  }

  for (const seed of MET_FLAG_SEED_QUERIES) {
    await runQuery({ q: seed.q, medium: seed.medium, titleOnly: true });
    await runQuery({ q: seed.q, medium: seed.medium, tagsOnly: true });
    await runQuery({
      q: seed.q,
      medium: seed.medium,
      artistOrCultureOnly: true,
    });
  }

  return [...all];
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
