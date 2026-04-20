import { artPoolCount, pickRandomObjectIdsFromPool } from "@/lib/art-pool";
import type { ArtPoolIngestRow } from "@/lib/art-sources/art-pool-ingest";
import type { PopularPoolIngestRow } from "@/lib/art-sources/popular-pool-types";
import { popularPoolSearchHitMatchesArtist } from "@/lib/art-sources/popular-pool-search-hit-match";
import { SEARCH_TERMS } from "./search-keywords";
import type { WallSlotPayload } from "./types";

const AIC_BASE = "https://api.artic.edu/api/v1";

type ArtworkSearchHit = {
  id?: number;
  title?: string;
  artist_display?: string;
  image_id?: string | null;
  date_display?: string;
  medium_display?: string;
};

type ArtworkDetail = ArtworkSearchHit & {
  credit_line?: string;
  department_title?: string;
  dimensions?: string;
};

type SearchResponse = {
  data?: ArtworkSearchHit[];
  config?: { iiif_url?: string };
  pagination?: { total_pages?: number; current_page?: number };
};

type ArtworkResponse = {
  data?: ArtworkDetail;
  config?: { iiif_url?: string };
};

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function iiifImageUrl(iiifBase: string, imageId: string): string {
  const base = iiifBase.replace(/\/$/, "");
  return `${base}/${imageId}/full/843,/0/default.jpg`;
}

export async function fetchArticArtwork(
  id: string,
): Promise<WallSlotPayload | null> {
  const fields = [
    "id",
    "title",
    "artist_display",
    "image_id",
    "date_display",
    "medium_display",
    "credit_line",
    "department_title",
    "dimensions",
  ].join(",");
  const res = await fetch(`${AIC_BASE}/artworks/${id}?fields=${fields}`, {
    next: { revalidate: 3600 },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as ArtworkResponse;
  const o = json.data;
  const iiifBase =
    json.config?.iiif_url?.replace(/\/$/, "") ??
    "https://www.artic.edu/iiif/2";
  if (!o?.id || !o.image_id?.trim()) return null;
  const imageUrl = iiifImageUrl(iiifBase, o.image_id.trim());
  return {
    source: "artic",
    objectId: String(o.id),
    title: (o.title ?? "Untitled").trim() || "Untitled",
    artist: (o.artist_display ?? "").trim(),
    imageUrl,
    objectUrl: `https://www.artic.edu/artworks/${o.id}`,
    objectDate: (o.date_display ?? "").trim() || undefined,
    medium: (o.medium_display ?? "").trim() || undefined,
    dimensions: (o.dimensions ?? "").trim() || undefined,
    department: (o.department_title ?? "").trim() || undefined,
    creditLine: (o.credit_line ?? "").trim() || undefined,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Paginated AIC search IDs for the art pool (`npm run art-pool:build`). */
export async function collectArticObjectIdsForPool(
  maxPagesPerTerm = 12,
): Promise<ArtPoolIngestRow[]> {
  const byId = new Map<number, string | null>();
  const fields =
    "id,title,artist_display,image_id,date_display,medium_display";
  for (const q of SEARCH_TERMS) {
    let page = 1;
    let totalPages = 1;
    do {
      const params = new URLSearchParams();
      params.set("q", q);
      params.set("fields", fields);
      params.set("limit", "100");
      params.set("page", String(page));
      const res = await fetch(`${AIC_BASE}/artworks/search?${params}`, {
        cache: "no-store",
      });
      if (!res.ok) break;
      const json = (await res.json()) as SearchResponse;
      totalPages = json.pagination?.total_pages ?? 1;
      for (const row of json.data ?? []) {
        if (row.id == null || !row.image_id) continue;
        if (!byId.has(row.id)) {
          const art = (row.artist_display ?? "").trim() || null;
          byId.set(row.id, art);
        }
      }
      page++;
      await sleep(45);
    } while (page <= totalPages && page <= maxPagesPerTerm);
    await sleep(45);
  }
  return [...byId.entries()].map(([id, poolArtist]) => ({
    objectId: String(id),
    poolArtist,
  }));
}

/** Paginated AIC search per artist for the `popular` pool. */
export async function collectArticObjectIdsForPopularPool(
  artistNames: readonly string[],
  maxPagesPerName = 10,
): Promise<PopularPoolIngestRow[]> {
  const out: PopularPoolIngestRow[] = [];
  const seen = new Set<string>();
  const fields =
    "id,title,artist_display,image_id,date_display,medium_display";
  for (const raw of artistNames) {
    const q = raw.trim();
    if (!q) continue;
    let page = 1;
    let totalPages = 1;
    do {
      const params = new URLSearchParams();
      params.set("q", q);
      params.set("fields", fields);
      params.set("limit", "100");
      params.set("page", String(page));
      const res = await fetch(`${AIC_BASE}/artworks/search?${params}`, {
        cache: "no-store",
      });
      if (!res.ok) break;
      const json = (await res.json()) as SearchResponse;
      totalPages = json.pagination?.total_pages ?? 1;
      for (const row of json.data ?? []) {
        if (row.id == null || !row.image_id) continue;
        if (!popularPoolSearchHitMatchesArtist(q, row.artist_display)) continue;
        const composite = `artic:${row.id}`;
        if (seen.has(composite)) continue;
        seen.add(composite);
        out.push({ compositeObjectId: composite, poolArtist: q });
      }
      page++;
      await sleep(45);
    } while (page <= totalPages && page <= maxPagesPerName);
    await sleep(45);
  }
  return out;
}

async function articSearchIds(q: string): Promise<number[]> {
  const fields =
    "id,title,artist_display,image_id,date_display,medium_display";
  const params = new URLSearchParams();
  params.set("q", q);
  params.set("fields", fields);
  params.set("limit", "80");
  /** Widen pool: AIC search supports pagination (large total result sets). */
  params.set("page", String(Math.floor(Math.random() * 40) + 1));
  const res = await fetch(`${AIC_BASE}/artworks/search?${params}`, {
    cache: "no-store",
  });
  if (!res.ok) return [];
  const json = (await res.json()) as SearchResponse;
  const rows = json.data ?? [];
  return rows
    .filter((r) => r.id != null && r.image_id)
    .map((r) => r.id!);
}

async function pickRandomArticId(exclude: Set<string>): Promise<string | null> {
  for (let attempt = 0; attempt < 18; attempt++) {
    const q = SEARCH_TERMS[Math.floor(Math.random() * SEARCH_TERMS.length)]!;
    const ids = await articSearchIds(q);
    if (ids.length === 0) continue;
    const candidates = [...ids];
    shuffleInPlace(candidates);
    for (const id of candidates) {
      const sid = String(id);
      if (!exclude.has(`artic:${sid}`)) return sid;
    }
  }
  return null;
}

export async function getRandomArticSlots(
  count: number,
  excludeIds: Iterable<string>,
): Promise<WallSlotPayload[]> {
  const exclude = new Set(excludeIds);
  const out: WallSlotPayload[] = [];
  let guard = 0;
  const usePool = (await artPoolCount("artic")) > 0;

  while (out.length < count && guard < count * 100) {
    guard++;
    const need = count - out.length;

    if (usePool) {
      const ids = await pickRandomObjectIdsFromPool("artic", exclude, need);
      if (ids.length > 0) {
        const fetched = await Promise.all(
          ids.map((oid) => fetchArticArtwork(oid)),
        );
        for (let i = 0; i < fetched.length; i++) {
          const slot = fetched[i];
          const oid = ids[i]!;
          if (!slot) {
            exclude.add(`artic:${oid}`);
            continue;
          }
          exclude.add(`artic:${slot.objectId}`);
          out.push(slot);
        }
        continue;
      }
    }

    const id = await pickRandomArticId(exclude);
    if (!id) break;
    const slot = await fetchArticArtwork(id);
    if (!slot) {
      exclude.add(`artic:${id}`);
      continue;
    }
    exclude.add(`artic:${slot.objectId}`);
    out.push(slot);
  }

  return out;
}

export { SEARCH_TERMS as ARTIC_SEARCH_TERMS } from "./search-keywords";
