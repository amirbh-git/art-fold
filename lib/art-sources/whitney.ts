import { artPoolCount, pickRandomObjectIdsFromPool } from "@/lib/art-pool";
import { SEARCH_TERMS } from "./search-keywords";
import type { WallSlotPayload } from "./types";

const WHITNEY_BASE = "https://whitney.org/api/artworks";

type WhitneyImage = {
  id?: number;
  url?: string;
};

type WhitneyArtworkAttrs = {
  id?: number;
  tms_id?: number;
  title?: string;
  display_artist_text?: string;
  display_date?: string;
  medium?: string;
  dimensions?: string;
  classification?: string;
  credit_line?: string;
  department?: string;
  images?: WhitneyImage[];
};

type WhitneyArtworkResource = {
  id?: string;
  type?: string;
  attributes?: WhitneyArtworkAttrs;
};

type WhitneyArtworkResponse = {
  data?: WhitneyArtworkResource;
};

type WhitneyListResponse = {
  data?: WhitneyArtworkResource[];
  meta?: { total?: number };
};

const PAGE_SIZE = 30;

function artworkImageUrl(attrs?: WhitneyArtworkAttrs): string | null {
  const u = attrs?.images?.[0]?.url?.trim();
  return u || null;
}

function resourceObjectId(res: WhitneyArtworkResource): string | null {
  const a = res.attributes;
  const n = a?.tms_id ?? a?.id;
  if (typeof n === "number" && Number.isFinite(n)) return String(n);
  const sid = res.id?.trim();
  if (sid && /^\d+$/.test(sid)) return sid;
  return null;
}

export async function fetchWhitneyArtwork(
  objectId: string,
): Promise<WallSlotPayload | null> {
  const res = await fetch(
    `${WHITNEY_BASE}/${encodeURIComponent(objectId)}`,
    { next: { revalidate: 3600 } },
  );
  if (!res.ok) return null;
  const json = (await res.json()) as WhitneyArtworkResponse;
  const wrap = json.data;
  const a = wrap?.attributes;
  const oid = resourceObjectId(wrap ?? {});
  if (!oid) return null;
  const imageUrl = artworkImageUrl(a);
  if (!imageUrl) return null;
  return {
    source: "whitney",
    objectId: oid,
    title: (a?.title ?? "Untitled").trim() || "Untitled",
    artist: (a?.display_artist_text ?? "").trim(),
    imageUrl,
    objectUrl: `https://whitney.org/collection/works/${encodeURIComponent(oid)}`,
    objectDate: (a?.display_date ?? "").trim() || undefined,
    medium: (a?.medium ?? "").trim() || undefined,
    dimensions: (a?.dimensions ?? "").trim() || undefined,
    department: (a?.classification ?? "").trim() || undefined,
    creditLine: (a?.credit_line ?? "").trim() || undefined,
  };
}

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function listRecords(json: WhitneyListResponse): WhitneyArtworkResource[] {
  return json.data ?? [];
}

/**
 * Walks the full collection in TMS id order (stable sort + pagination) and
 * collects ids that have at least one image. This reaches essentially every
 * published work with an image, unlike keyword title search which only covered
 * a small fraction.
 *
 * @param maxPages — optional cap on API pages (30 works each). Omit for full crawl (~900+ requests).
 */
export async function collectWhitneyObjectIdsForPool(
  maxPages?: number,
): Promise<number[]> {
  const all = new Set<number>();

  const ingest = (json: WhitneyListResponse): void => {
    for (const row of listRecords(json)) {
      const a = row.attributes;
      if (!artworkImageUrl(a)) continue;
      const id = a?.tms_id ?? a?.id;
      if (typeof id === "number" && Number.isFinite(id)) all.add(id);
    }
  };

  const listParams = (): URLSearchParams => {
    const p = new URLSearchParams();
    p.set("q[s]", "tms_id+asc");
    return p;
  };

  const firstParams = listParams();
  firstParams.set("page", "1");
  const firstRes = await fetch(`${WHITNEY_BASE}?${firstParams}`, {
    cache: "no-store",
  });
  if (!firstRes.ok) return [];
  const firstJson = (await firstRes.json()) as WhitneyListResponse;
  const total = firstJson.meta?.total ?? 0;
  if (total <= 0) return [];

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const limit =
    maxPages != null && Number.isFinite(maxPages) && maxPages > 0
      ? Math.min(totalPages, Math.floor(maxPages))
      : totalPages;

  ingest(firstJson);

  for (let page = 2; page <= limit; page++) {
    await sleep(50);
    const params = listParams();
    params.set("page", String(page));
    const res = await fetch(`${WHITNEY_BASE}?${params}`, {
      cache: "no-store",
    });
    if (!res.ok) break;
    const json = (await res.json()) as WhitneyListResponse;
    ingest(json);
  }

  return [...all];
}

async function whitneySearchIdsByTitle(q: string): Promise<number[]> {
  const params = new URLSearchParams();
  params.set("q[title_cont]", q);
  params.set("page", String(Math.floor(Math.random() * 60) + 1));
  const res = await fetch(`${WHITNEY_BASE}?${params}`, {
    cache: "no-store",
  });
  if (!res.ok) return [];
  const json = (await res.json()) as WhitneyListResponse;
  const ids: number[] = [];
  for (const row of listRecords(json)) {
    const a = row.attributes;
    if (!artworkImageUrl(a)) continue;
    const id = a?.tms_id ?? a?.id;
    if (typeof id === "number" && Number.isFinite(id)) ids.push(id);
  }
  return ids;
}

async function whitneySearchIdsRandom(): Promise<number[]> {
  const probe = await fetch(
    `${WHITNEY_BASE}?${new URLSearchParams({ page: "1", "q[s]": "random" })}`,
    { cache: "no-store" },
  );
  if (!probe.ok) return [];
  const probeJson = (await probe.json()) as WhitneyListResponse;
  const total = probeJson.meta?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.floor(Math.random() * Math.min(totalPages, 400)) + 1;
  const params = new URLSearchParams();
  params.set("q[s]", "random");
  params.set("page", String(page));
  const res = await fetch(`${WHITNEY_BASE}?${params}`, {
    cache: "no-store",
  });
  if (!res.ok) return [];
  const json = (await res.json()) as WhitneyListResponse;
  const ids: number[] = [];
  for (const row of listRecords(json)) {
    const a = row.attributes;
    if (!artworkImageUrl(a)) continue;
    const id = a?.tms_id ?? a?.id;
    if (typeof id === "number" && Number.isFinite(id)) ids.push(id);
  }
  return ids;
}

async function pickRandomWhitneyId(exclude: Set<string>): Promise<string | null> {
  for (let attempt = 0; attempt < 18; attempt++) {
    const useRandom = attempt % 3 === 0;
    const ids = useRandom
      ? await whitneySearchIdsRandom()
      : await whitneySearchIdsByTitle(
          SEARCH_TERMS[Math.floor(Math.random() * SEARCH_TERMS.length)]!,
        );
    if (ids.length === 0) continue;
    const candidates = [...ids];
    shuffleInPlace(candidates);
    for (const id of candidates) {
      const sid = String(id);
      if (!exclude.has(`whitney:${sid}`)) return sid;
    }
  }
  return null;
}

export async function getRandomWhitneySlots(
  count: number,
  excludeIds: Iterable<string>,
): Promise<WallSlotPayload[]> {
  const exclude = new Set(excludeIds);
  const out: WallSlotPayload[] = [];
  let guard = 0;
  const usePool = (await artPoolCount("whitney")) > 0;

  while (out.length < count && guard < count * 100) {
    guard++;
    const need = count - out.length;

    if (usePool) {
      const ids = await pickRandomObjectIdsFromPool("whitney", exclude, need);
      if (ids.length > 0) {
        const fetched = await Promise.all(
          ids.map((oid) => fetchWhitneyArtwork(oid)),
        );
        for (let i = 0; i < fetched.length; i++) {
          const slot = fetched[i];
          const oid = ids[i]!;
          if (!slot) {
            exclude.add(`whitney:${oid}`);
            continue;
          }
          exclude.add(`whitney:${slot.objectId}`);
          out.push(slot);
        }
        continue;
      }
    }

    const id = await pickRandomWhitneyId(exclude);
    if (!id) break;
    const slot = await fetchWhitneyArtwork(id);
    if (!slot) {
      exclude.add(`whitney:${id}`);
      continue;
    }
    exclude.add(`whitney:${slot.objectId}`);
    out.push(slot);
  }

  return out;
}

export { SEARCH_TERMS as WHITNEY_SEARCH_TERMS } from "./search-keywords";
