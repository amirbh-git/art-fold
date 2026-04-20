import { artPoolCount, pickRandomObjectIdsFromPool } from "@/lib/art-pool";
import type { ArtPoolIngestRow } from "@/lib/art-sources/art-pool-ingest";
import type { PopularPoolIngestRow } from "@/lib/art-sources/popular-pool-types";
import { popularPoolSearchHitMatchesArtist } from "@/lib/art-sources/popular-pool-search-hit-match";
import { SEARCH_TERMS as KEYWORDS } from "./search-keywords";
import type { WallSlotPayload } from "./types";

const HARVARD_BASE = "https://api.harvardartmuseums.org";

type HarvardPerson = {
  role?: string;
  displayname?: string;
  name?: string;
};

type HarvardImage = {
  iiifbaseuri?: string;
  baseimageurl?: string;
};

type HarvardObject = {
  objectid?: number;
  id?: number;
  title?: string;
  /** Present on list records; used to recover numeric id when objectid is omitted. */
  primaryimageurl?: string;
  url?: string;
  dated?: string;
  medium?: string;
  dimensions?: string;
  department?: string;
  creditline?: string;
  people?: HarvardPerson[];
  images?: HarvardImage[];
};

type HarvardListResponse = {
  records?: HarvardObject[];
  info?: { pages?: number; totalrecords?: number };
};

function recordNumericId(r: HarvardObject): number | null {
  if (typeof r.objectid === "number") return r.objectid;
  if (typeof r.id === "number") return r.id;
  const m = r.url?.match(/\/object\/(\d+)/);
  if (m?.[1]) {
    const n = Number(m[1]);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function harvardApiKey(): string | null {
  const k = process.env.HARVARD_ART_API_KEY?.trim();
  return k || null;
}

function harvardDisplayImageUrl(o: HarvardObject): string | null {
  const img0 = o.images?.[0];
  const iiif = img0?.iiifbaseuri?.trim();
  if (iiif) {
    return `${iiif.replace(/\/$/, "")}/full/843,/0/default.jpg`;
  }
  const primary = o.primaryimageurl?.trim();
  if (!primary) return null;
  const u = primary.replace(/^http:\/\//i, "https://");
  if (u.includes("/full/")) return u;
  if (/_dynmc$/i.test(u) || /\.(jpe?g|png|webp)(\?|$)/i.test(u)) return u;
  return `${u.replace(/\/$/, "")}/full/843,/0/default.jpg`;
}

function artistFromPeople(people?: HarvardPerson[]): string {
  if (!people?.length) return "";
  const artist =
    people.find((p) => (p.role ?? "").toLowerCase().includes("artist")) ??
    people[0];
  return (artist?.displayname ?? artist?.name ?? "").trim();
}

export async function fetchHarvardObject(
  objectId: string,
): Promise<WallSlotPayload | null> {
  const key = harvardApiKey();
  if (!key) return null;
  const res = await fetch(
    `${HARVARD_BASE}/object/${encodeURIComponent(objectId)}?apikey=${encodeURIComponent(key)}`,
    { next: { revalidate: 3600 } },
  );
  if (!res.ok) return null;
  const o = (await res.json()) as HarvardObject;
  const oid = o.objectid ?? o.id;
  if (oid == null) return null;
  const imageUrl = harvardDisplayImageUrl(o);
  if (!imageUrl) return null;
  const sid = String(oid);
  return {
    source: "harvard",
    objectId: sid,
    title: (o.title ?? "Untitled").trim() || "Untitled",
    artist: artistFromPeople(o.people),
    imageUrl,
    objectUrl: (o.url ?? "").trim().replace(/^http:\/\//i, "https://"),
    objectDate: (o.dated ?? "").trim() || undefined,
    medium: (o.medium ?? "").trim() || undefined,
    dimensions: (o.dimensions ?? "").trim() || undefined,
    department: (o.department ?? "").trim() || undefined,
    creditLine: (o.creditline ?? "").trim() || undefined,
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

/** Paginated Harvard object IDs for the art pool (`npm run art-pool:build`). Requires `HARVARD_ART_API_KEY`. */
export async function collectHarvardObjectIdsForPool(
  maxPagesPerKeyword = 15,
): Promise<ArtPoolIngestRow[]> {
  const key = harvardApiKey();
  if (!key) return [];
  const byId = new Map<number, string | null>();
  for (const keyword of KEYWORDS) {
    let page = 1;
    let totalPages = 1;
    do {
      const params = new URLSearchParams();
      params.set("apikey", key);
      params.set("keyword", keyword);
      params.set("hasimage", "1");
      params.set("size", "100");
      params.set("page", String(page));
      const res = await fetch(`${HARVARD_BASE}/object?${params}`, {
        cache: "no-store",
      });
      if (!res.ok) break;
      const json = (await res.json()) as HarvardListResponse;
      totalPages = json.info?.pages ?? 1;
      for (const r of json.records ?? []) {
        const id = recordNumericId(r);
        if (id == null) continue;
        if (!byId.has(id)) {
          const art = artistFromPeople(r.people).trim() || null;
          byId.set(id, art);
        }
      }
      page++;
      await sleep(60);
    } while (page <= totalPages && page <= maxPagesPerKeyword);
    await sleep(60);
  }
  return [...byId.entries()].map(([id, poolArtist]) => ({
    objectId: String(id),
    poolArtist,
  }));
}

/** Keyword search per artist for the `popular` pool. Requires `HARVARD_ART_API_KEY`. */
export async function collectHarvardObjectIdsForPopularPool(
  artistNames: readonly string[],
  maxPagesPerName = 12,
): Promise<PopularPoolIngestRow[]> {
  const key = harvardApiKey();
  if (!key) return [];
  const out: PopularPoolIngestRow[] = [];
  const seen = new Set<string>();
  for (const raw of artistNames) {
    const keyword = raw.trim();
    if (!keyword) continue;
    let page = 1;
    let totalPages = 1;
    do {
      const params = new URLSearchParams();
      params.set("apikey", key);
      params.set("keyword", keyword);
      params.set("hasimage", "1");
      params.set("size", "100");
      params.set("page", String(page));
      const res = await fetch(`${HARVARD_BASE}/object?${params}`, {
        cache: "no-store",
      });
      if (!res.ok) break;
      const json = (await res.json()) as HarvardListResponse;
      totalPages = json.info?.pages ?? 1;
      for (const r of json.records ?? []) {
        const id = recordNumericId(r);
        if (id == null) continue;
        if (!popularPoolSearchHitMatchesArtist(keyword, artistFromPeople(r.people)))
          continue;
        const composite = `harvard:${id}`;
        if (seen.has(composite)) continue;
        seen.add(composite);
        out.push({ compositeObjectId: composite, poolArtist: keyword });
      }
      page++;
      await sleep(60);
    } while (page <= totalPages && page <= maxPagesPerName);
    await sleep(60);
  }
  return out;
}

async function harvardSearchIds(keyword: string): Promise<number[]> {
  const key = harvardApiKey();
  if (!key) return [];
  const params = new URLSearchParams();
  params.set("apikey", key);
  params.set("keyword", keyword);
  params.set("hasimage", "1");
  params.set("size", "80");
  params.set("page", String(Math.floor(Math.random() * 120) + 1));
  const res = await fetch(`${HARVARD_BASE}/object?${params}`, {
    cache: "no-store",
  });
  if (!res.ok) return [];
  const json = (await res.json()) as HarvardListResponse;
  const records = json.records ?? [];
  return records
    .map((r) => recordNumericId(r))
    .filter((id): id is number => id != null && Number.isFinite(id));
}

async function pickRandomHarvardId(exclude: Set<string>): Promise<string | null> {
  const key = harvardApiKey();
  if (!key) return null;
  for (let attempt = 0; attempt < 18; attempt++) {
    const kw = KEYWORDS[Math.floor(Math.random() * KEYWORDS.length)]!;
    const ids = await harvardSearchIds(kw);
    if (ids.length === 0) continue;
    const candidates = [...ids];
    shuffleInPlace(candidates);
    for (const id of candidates) {
      const sid = String(id);
      if (!exclude.has(`harvard:${sid}`)) return sid;
    }
  }
  return null;
}

export function isHarvardConfigured(): boolean {
  return harvardApiKey() != null;
}

export async function getRandomHarvardSlots(
  count: number,
  excludeIds: Iterable<string>,
): Promise<WallSlotPayload[]> {
  if (!isHarvardConfigured()) return [];
  const exclude = new Set(excludeIds);
  const out: WallSlotPayload[] = [];
  let guard = 0;
  const usePool = (await artPoolCount("harvard")) > 0;

  while (out.length < count && guard < count * 100) {
    guard++;
    const need = count - out.length;

    if (usePool) {
      const ids = await pickRandomObjectIdsFromPool("harvard", exclude, need);
      if (ids.length > 0) {
        const fetched = await Promise.all(
          ids.map((oid) => fetchHarvardObject(oid)),
        );
        for (let i = 0; i < fetched.length; i++) {
          const slot = fetched[i];
          const oid = ids[i]!;
          if (!slot) {
            exclude.add(`harvard:${oid}`);
            continue;
          }
          exclude.add(`harvard:${slot.objectId}`);
          out.push(slot);
        }
        continue;
      }
    }

    const id = await pickRandomHarvardId(exclude);
    if (!id) break;
    const slot = await fetchHarvardObject(id);
    if (!slot) {
      exclude.add(`harvard:${id}`);
      continue;
    }
    exclude.add(`harvard:${slot.objectId}`);
    out.push(slot);
  }

  return out;
}

export { SEARCH_TERMS as HARVARD_KEYWORDS } from "./search-keywords";
