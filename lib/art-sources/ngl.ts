import { artPoolCount, pickRandomObjectIdsFromPool } from "@/lib/art-pool";
import type { WallSlotPayload } from "./types";

/** National Gallery, London — Elasticsearch + collection pages (no API key). */
const ES_BASE = "https://data.ng.ac.uk/es/public/_search";
const STATIC_IMAGE_BASE = "https://data.ng.ac.uk/media/static/";

type NglAdmin = { uid?: string };
type NglHitSource = {
  "@admin"?: NglAdmin;
  title?: Array<{ type?: string; value?: string; primary?: boolean }>;
  creation?: Array<{
    date?: Array<{ value?: string; from?: string; to?: string }>;
    attribution?: Array<{ type?: string; value?: string }>;
    maker?: Array<{ summary?: { title?: string } }>;
  }>;
  identifier?: Array<{ type?: string; value?: string }>;
  legal?: { credit?: string };
  materials?: Array<{ part?: string }>;
  measurements?: Array<{ display?: string }>;
  multimedia?: NglMultimediaItem[];
  access?: { media?: { public_image?: boolean } };
};

type NglMultimediaItem = {
  "@type"?: string;
  "@processed"?: {
    mid?: { location?: string };
  };
};

type EsHit<T> = { _source?: T };
type EsSearchResponse<T> = {
  hits: {
    total: { value: number; relation: string };
    hits: EsHit<T>[];
  };
};

const OBJECTS_WITH_IMAGE_QUERY = {
  bool: {
    filter: [
      { term: { "@datatype.base": "object" } },
      { term: { "access.media.public_image": true } },
      { exists: { field: "multimedia" } },
    ],
  },
} as const;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function firstMidImageUrl(multimedia?: NglMultimediaItem[]): string | null {
  if (!multimedia?.length) return null;
  for (const m of multimedia) {
    if (m["@type"] !== "image") continue;
    const loc = m["@processed"]?.mid?.location?.trim();
    if (loc && !/^https?:\/\//i.test(loc)) {
      return `${STATIC_IMAGE_BASE}${loc.replace(/^\//, "")}`;
    }
  }
  return null;
}

function extractTitle(src: NglHitSource): string {
  const titles = src.title;
  if (Array.isArray(titles)) {
    const full = titles.find((t) => t.type === "full title");
    if (full?.value?.trim()) return full.value.trim();
    const prim = titles.find((t) => t.primary === true);
    if (prim?.value?.trim()) return prim.value.trim();
    const first = titles[0];
    if (first?.value?.trim()) return first.value.trim();
  }
  return "Untitled";
}

function extractArtist(src: NglHitSource): string {
  const creation = src.creation?.[0];
  if (!creation) return "";
  const makers = creation.maker;
  if (Array.isArray(makers) && makers[0]?.summary?.title) {
    return makers[0].summary.title.trim();
  }
  const attr = creation.attribution;
  if (Array.isArray(attr)) {
    const withDates = attr.find((a) => a.type === "attribution with dates");
    const plain = attr.find((a) => a.type === "attribution");
    const pick = withDates ?? plain;
    if (pick?.value) return stripHtml(pick.value);
  }
  return "";
}

function extractObjectDate(src: NglHitSource): string | undefined {
  const d0 = src.creation?.[0]?.date?.[0];
  if (!d0) return undefined;
  const from = d0.from?.trim();
  const to = d0.to?.trim();
  if (from && to && from !== to) return `${from}–${to}`;
  const v = d0.value?.trim();
  return v || from || undefined;
}

function extractCreditLine(src: NglHitSource): string | undefined {
  const c = src.legal?.credit;
  if (typeof c === "string" && c.trim()) return c.trim();
  return undefined;
}

function extractMedium(src: NglHitSource): string | undefined {
  const mats = src.materials;
  if (!Array.isArray(mats)) return undefined;
  const parts = mats
    .map((m) => m.part?.trim())
    .filter((p): p is string => Boolean(p));
  if (parts.length === 0) return undefined;
  return parts.join("; ");
}

function extractDimensions(src: NglHitSource): string | undefined {
  const d = src.measurements?.[0]?.display?.trim();
  return d || undefined;
}

async function esSearch<T>(
  body: Record<string, unknown>,
  init?: RequestInit & { next?: { revalidate?: number } },
): Promise<EsSearchResponse<T>> {
  const res = await fetch(ES_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    ...init,
  });
  if (!res.ok) {
    throw new Error(`NGL ES ${res.status}`);
  }
  return (await res.json()) as EsSearchResponse<T>;
}

function wallSlotFromSource(
  uid: string,
  src: NglHitSource,
): WallSlotPayload | null {
  if (src.access?.media?.public_image === false) return null;
  const imageUrl = firstMidImageUrl(src.multimedia);
  if (!imageUrl) return null;
  return {
    source: "ngl",
    objectId: uid,
    title: extractTitle(src),
    artist: extractArtist(src),
    imageUrl,
    objectUrl: `https://data.ng.ac.uk/${encodeURIComponent(uid)}`,
    objectDate: extractObjectDate(src),
    medium: extractMedium(src),
    dimensions: extractDimensions(src),
    creditLine: extractCreditLine(src),
  };
}

export async function fetchNglObject(
  objectId: string,
): Promise<WallSlotPayload | null> {
  let json: EsSearchResponse<NglHitSource>;
  try {
    json = await esSearch<NglHitSource>(
      {
        size: 1,
        query: { term: { "@admin.uid": objectId } },
      },
      { next: { revalidate: 3600 } },
    );
  } catch {
    return null;
  }
  const hit = json.hits.hits[0]?._source;
  if (!hit) return null;
  const uid = hit["@admin"]?.uid ?? objectId;
  return wallSlotFromSource(uid, hit);
}

/**
 * Paginates Elasticsearch (`public_image` + `multimedia`) and stores object
 * PIDs. No API key. Run via `npm run art-pool:build -- --only ngl`.
 */
export async function collectNglObjectIdsForPool(): Promise<string[]> {
  const all = new Set<string>();
  const pageSize = 100;
  let total = 0;
  try {
    const first = await esSearch<NglHitSource>(
      {
        size: 0,
        query: OBJECTS_WITH_IMAGE_QUERY,
      },
      { cache: "no-store" },
    );
    total = first.hits.total.value;
  } catch {
    return [];
  }

  for (let from = 0; from < total; from += pageSize) {
    let json: EsSearchResponse<NglHitSource>;
    try {
      json = await esSearch<NglHitSource>(
        {
          from,
          size: pageSize,
          query: OBJECTS_WITH_IMAGE_QUERY,
          _source: ["@admin.uid"],
          sort: [{ "@admin.uid": "asc" }],
        },
        { cache: "no-store" },
      );
    } catch {
      break;
    }
    for (const h of json.hits.hits) {
      const uid = h._source?.["@admin"]?.uid;
      if (uid) all.add(uid);
    }
    await sleep(40);
  }

  return [...all];
}

async function pickRandomNglId(exclude: Set<string>): Promise<string | null> {
  const pageSize = 80;
  let total = 0;
  try {
    const t = await esSearch<NglHitSource>(
      {
        size: 0,
        query: OBJECTS_WITH_IMAGE_QUERY,
      },
      { cache: "no-store" },
    );
    total = t.hits.total.value;
  } catch {
    return null;
  }
  if (total <= 0) return null;
  const maxFrom = Math.max(0, total - pageSize);

  for (let attempt = 0; attempt < 22; attempt++) {
    const from = Math.floor(Math.random() * (maxFrom + 1));
    let json: EsSearchResponse<NglHitSource>;
    try {
      json = await esSearch<NglHitSource>(
        {
          from,
          size: pageSize,
          query: OBJECTS_WITH_IMAGE_QUERY,
          _source: ["@admin.uid"],
          sort: [{ "@admin.uid": "asc" }],
        },
        { cache: "no-store" },
      );
    } catch {
      continue;
    }
    const ids = json.hits.hits
      .map((h) => h._source?.["@admin"]?.uid)
      .filter((u): u is string => Boolean(u));
    shuffleInPlace(ids);
    for (const id of ids) {
      if (!exclude.has(`ngl:${id}`)) return id;
    }
  }
  return null;
}

export async function getRandomNglSlots(
  count: number,
  excludeIds: Iterable<string>,
): Promise<WallSlotPayload[]> {
  const exclude = new Set(excludeIds);
  const out: WallSlotPayload[] = [];
  let guard = 0;
  const usePool = (await artPoolCount("ngl")) > 0;

  while (out.length < count && guard < count * 100) {
    guard++;
    const need = count - out.length;

    if (usePool) {
      const ids = await pickRandomObjectIdsFromPool("ngl", exclude, need);
      if (ids.length > 0) {
        const fetched = await Promise.all(ids.map((oid) => fetchNglObject(oid)));
        for (let i = 0; i < fetched.length; i++) {
          const slot = fetched[i];
          const oid = ids[i]!;
          if (!slot) {
            exclude.add(`ngl:${oid}`);
            continue;
          }
          exclude.add(`ngl:${slot.objectId}`);
          out.push(slot);
        }
        continue;
      }
    }

    const id = await pickRandomNglId(exclude);
    if (!id) break;
    const slot = await fetchNglObject(id);
    if (!slot) {
      exclude.add(`ngl:${id}`);
      continue;
    }
    exclude.add(`ngl:${slot.objectId}`);
    out.push(slot);
  }

  return out;
}
