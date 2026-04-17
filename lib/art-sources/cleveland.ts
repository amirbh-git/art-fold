import { artPoolCount, pickRandomObjectIdsFromPool } from "@/lib/art-pool";
import { SEARCH_TERMS } from "./search-keywords";
import type { WallSlotPayload } from "./types";

const CMA_BASE = "https://openaccess-api.clevelandart.org/api/artworks";

type CmaImages = {
  web?: { url?: string };
};

type CmaArtwork = {
  id?: number;
  title?: string;
  tombstone?: string;
  creation_date?: string;
  technique?: string;
  measurements?: string;
  department?: string;
  url?: string;
  images?: CmaImages | null;
};

type CmaListResponse = {
  data?: CmaArtwork[];
  info?: { total?: number };
};

type CmaOneResponse = {
  data?: CmaArtwork;
};

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function imageFromArtwork(o: CmaArtwork): string | null {
  const u = o.images?.web?.url?.trim();
  return u || null;
}

export async function fetchClevelandArtwork(
  id: string,
): Promise<WallSlotPayload | null> {
  const res = await fetch(`${CMA_BASE}/${encodeURIComponent(id)}`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  const json = (await res.json()) as CmaOneResponse;
  const o = json.data;
  if (!o?.id) return null;
  const imageUrl = imageFromArtwork(o);
  if (!imageUrl) return null;

  const oid = String(o.id);
  return {
    source: "cleveland",
    objectId: oid,
    title: (o.title ?? "Untitled").trim() || "Untitled",
    artist: "",
    imageUrl,
    objectUrl: (o.url ?? "").trim(),
    objectDate: (o.creation_date ?? "").trim() || undefined,
    medium: (o.technique ?? "").trim() || undefined,
    dimensions: (o.measurements ?? "").trim() || undefined,
    department: (o.department ?? "").trim() || undefined,
    creditLine: (o.tombstone ?? "").trim() || undefined,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Paginated Cleveland Open Access IDs for the art pool (`npm run art-pool:build`). */
export async function collectClevelandObjectIdsForPool(
  maxPagesPerQuery = 40,
): Promise<number[]> {
  const all = new Set<number>();
  const limit = 100;
  for (const q of SEARCH_TERMS) {
    const probe = new URLSearchParams();
    probe.set("q", q);
    probe.set("has_image", "1");
    probe.set("limit", "1");
    const probeRes = await fetch(`${CMA_BASE}/?${probe}`, {
      cache: "no-store",
    });
    if (!probeRes.ok) continue;
    const probeJson = (await probeRes.json()) as CmaListResponse;
    const total = probeJson.info?.total ?? 0;
    let skip = 0;
    let pages = 0;
    while (skip < total && pages < maxPagesPerQuery) {
      const params = new URLSearchParams();
      params.set("q", q);
      params.set("has_image", "1");
      params.set("limit", String(limit));
      params.set("skip", String(skip));
      const res = await fetch(`${CMA_BASE}/?${params}`, { cache: "no-store" });
      await sleep(50);
      if (!res.ok) break;
      const json = (await res.json()) as CmaListResponse;
      const rows = json.data ?? [];
      if (rows.length === 0) break;
      for (const r of rows) {
        if (r.id != null && imageFromArtwork(r)) all.add(r.id);
      }
      skip += limit;
      pages++;
    }
    await sleep(50);
  }
  return [...all];
}

async function clevelandSearchIds(q: string): Promise<number[]> {
  const params = new URLSearchParams();
  params.set("q", q);
  params.set("has_image", "1");
  params.set("limit", "80");
  /** Skip into the result list so the same query does not always return the same page of IDs. */
  params.set("skip", String(Math.floor(Math.random() * 400)));
  const res = await fetch(`${CMA_BASE}/?${params}`, { cache: "no-store" });
  if (!res.ok) return [];
  const json = (await res.json()) as CmaListResponse;
  const rows = json.data ?? [];
  return rows.filter((r) => r.id != null && imageFromArtwork(r)).map((r) => r.id!);
}

async function pickRandomClevelandId(
  exclude: Set<string>,
): Promise<string | null> {
  for (let attempt = 0; attempt < 18; attempt++) {
    const q = SEARCH_TERMS[Math.floor(Math.random() * SEARCH_TERMS.length)]!;
    const ids = await clevelandSearchIds(q);
    if (ids.length === 0) continue;
    const candidates = [...ids];
    shuffleInPlace(candidates);
    for (const id of candidates) {
      const sid = String(id);
      if (!exclude.has(`cleveland:${sid}`)) return sid;
    }
  }
  return null;
}

export async function getRandomClevelandSlots(
  count: number,
  excludeIds: Iterable<string>,
): Promise<WallSlotPayload[]> {
  const exclude = new Set(excludeIds);
  const out: WallSlotPayload[] = [];
  let guard = 0;
  const usePool = (await artPoolCount("cleveland")) > 0;

  while (out.length < count && guard < count * 100) {
    guard++;
    let id: string | null = null;
    if (usePool) {
      const fromPool = await pickRandomObjectIdsFromPool("cleveland", exclude, 1);
      if (fromPool.length > 0) id = fromPool[0]!;
    }
    if (id == null) id = await pickRandomClevelandId(exclude);
    if (!id) break;
    const slot = await fetchClevelandArtwork(id);
    if (!slot) {
      exclude.add(`cleveland:${id}`);
      continue;
    }
    exclude.add(`cleveland:${slot.objectId}`);
    out.push(slot);
  }

  return out;
}

export { SEARCH_TERMS as CLEVELAND_SEARCH_TERMS } from "./search-keywords";
