import { artPoolCount, pickRandomObjectIdsFromPool } from "@/lib/art-pool";
import type { ArtPoolIngestRow } from "@/lib/art-sources/art-pool-ingest";
import type { PopularPoolIngestRow } from "@/lib/art-sources/popular-pool-types";
import { popularPoolSearchHitMatchesArtist } from "@/lib/art-sources/popular-pool-search-hit-match";
import { SEARCH_TERMS } from "./search-keywords";
import type { WallSlotPayload } from "./types";

/** Victoria and Albert Museum — Collections API v2 (no API key). @see https://developers.vam.ac.uk/ */
const VAM_BASE = "https://api.vam.ac.uk/v2";

type VamSearchRecord = {
  systemNumber?: string;
  _primaryImageId?: string;
  _primaryTitle?: string;
  /** Present on search hits; primary maker display string for pool ingest. */
  _primaryMaker?: { name?: string; association?: string };
};

type VamSearchResponse = {
  info?: {
    record_count?: number;
    pages?: number;
    page?: number;
    page_size?: number;
  };
  records?: VamSearchRecord[];
};

type VamMakerRow = {
  name?: { text?: string };
  association?: { text?: string };
};

type VamObjectResponse = {
  meta?: {
    _links?: { collection_page?: { href?: string } };
    images?: {
      _iiif_image?: string;
      _primary_thumbnail?: string;
    };
  };
  record?: {
    systemNumber?: string;
    objectType?: string;
    titles?: Array<{ title?: string }>;
    artistMakerPerson?: VamMakerRow[];
    /** Same shape as `artistMakerPerson`; used for some object types. */
    artistMakerPeople?: VamMakerRow[];
    /** Studios / manufacturers (used when no individual is listed). */
    artistMakerOrganisations?: VamMakerRow[];
    creditLine?: string;
    materialsAndTechniques?: string;
    dimensions?: Array<{
      dimension?: string;
      value?: string;
      unit?: string;
      part?: string;
    }>;
    dimensionsNote?: string;
    production?: string;
    collectionCode?: { text?: string };
  };
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

function iiifDisplayUrl(iiifBase: string): string | null {
  const b = iiifBase.trim();
  if (!b) return null;
  const withSlash = b.endsWith("/") ? b : `${b}/`;
  return `${withSlash}full/843,/0/default.jpg`;
}

function titleFromRecord(rec: VamObjectResponse["record"]): string {
  const t = rec?.titles?.[0]?.title?.trim();
  if (t) return t;
  return "Untitled";
}

/** V&A Collections API — `association.text` describes the person's role. */
const VAM_ASSOCIATION_PRIORITY: ReadonlyArray<RegExp> = [
  /\bartist\b/i,
  /\bdesigner\b/i,
  /\bmaker\b/i,
  /\bmodeller\b/i,
  /\bmodeler\b/i,
  /\bpainter\b/i,
  /\bprintmaker\b/i,
  /\bphotographer\b/i,
  /\barchitect\b/i,
  /\bsculptor\b/i,
  /\bweaver\b/i,
  /\bpatron\b/i,
];

function associationRank(associationText: string): number {
  const t = associationText.toLowerCase();
  for (let i = 0; i < VAM_ASSOCIATION_PRIORITY.length; i++) {
    if (VAM_ASSOCIATION_PRIORITY[i]!.test(t)) return i;
  }
  return VAM_ASSOCIATION_PRIORITY.length;
}

function namesFromMakerRows(rows: VamMakerRow[] | undefined): string[] {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const sorted = [...rows].sort(
    (a, b) =>
      associationRank(a.association?.text ?? "") -
      associationRank(b.association?.text ?? ""),
  );
  const names = sorted
    .map((p) => (p.name?.text ?? "").trim().replace(/,\s*$/, ""))
    .filter(Boolean);
  return [...new Set(names)];
}

function artistFromRecord(rec: VamObjectResponse["record"]): string {
  const fromPerson = namesFromMakerRows(rec?.artistMakerPerson);
  if (fromPerson.length > 0) return fromPerson.join("; ");
  const fromPeople = namesFromMakerRows(rec?.artistMakerPeople);
  if (fromPeople.length > 0) return fromPeople.join("; ");
  const fromOrgs = namesFromMakerRows(rec?.artistMakerOrganisations);
  if (fromOrgs.length > 0) return fromOrgs.join("; ");
  return "";
}

function dimensionsFromRecord(rec: VamObjectResponse["record"]): string | undefined {
  const note = rec?.dimensionsNote?.trim();
  if (note) return note;
  const dims = rec?.dimensions;
  if (!Array.isArray(dims) || !dims.length) return undefined;
  const parts = dims
    .map((d) => {
      const dim = d.dimension?.trim();
      const v = d.value?.trim();
      const u = d.unit?.trim();
      if (!v) return "";
      const bit = [dim, v, u].filter(Boolean).join(" ");
      return d.part ? `${bit} (${d.part})` : bit;
    })
    .filter(Boolean);
  return parts.length ? parts.join("; ") : undefined;
}

export async function fetchVamObject(
  objectId: string,
): Promise<WallSlotPayload | null> {
  const res = await fetch(
    `${VAM_BASE}/object/${encodeURIComponent(objectId)}`,
    { next: { revalidate: 3600 } },
  );
  if (!res.ok) return null;
  const json = (await res.json()) as VamObjectResponse;
  const rec = json.record;
  const sid = rec?.systemNumber?.trim() ?? objectId;
  const meta = json.meta;
  const iiif = meta?.images?._iiif_image?.trim();
  let imageUrl: string | null = iiif ? iiifDisplayUrl(iiif) : null;
  if (!imageUrl && meta?.images?._primary_thumbnail) {
    const th = meta.images._primary_thumbnail;
    const upgraded = th.replace(/\/full\/![^/]+\//, "/full/843,/");
    imageUrl = upgraded !== th ? upgraded : th;
  }
  if (!imageUrl) return null;

  const objectUrl =
    meta?._links?.collection_page?.href?.trim() ??
    `https://collections.vam.ac.uk/item/${encodeURIComponent(sid)}/`;

  return {
    source: "vam",
    objectId: sid,
    title: titleFromRecord(rec),
    artist: artistFromRecord(rec),
    imageUrl,
    objectUrl,
    objectDate: rec?.production?.trim() || undefined,
    medium:
      rec?.materialsAndTechniques?.trim() ||
      rec?.objectType?.trim() ||
      undefined,
    dimensions: dimensionsFromRecord(rec),
    department: rec?.collectionCode?.text?.trim() || undefined,
    creditLine: rec?.creditLine?.trim() || undefined,
  };
}

/** API caps offset pagination at 100 pages × page_size (10k rows per query). */
const POOL_PAGE_SIZE = 100;
const POOL_MAX_PAGES = 100;

/**
 * Paginates `images_exist=1` up to the API limit (100 pages × 100 rows = 10k IDs
 * per query). The V&A API does not return pages beyond 100 for a single search.
 */
function poolArtistFromVamSearchRecord(r: VamSearchRecord): string | null {
  const n = r._primaryMaker?.name?.trim();
  return n || null;
}

export async function collectVamObjectIdsForPool(): Promise<ArtPoolIngestRow[]> {
  const byId = new Map<string, string | null>();

  for (let page = 1; page <= POOL_MAX_PAGES; page++) {
    const params = new URLSearchParams();
    params.set("images_exist", "1");
    params.set("page_size", String(POOL_PAGE_SIZE));
    params.set("page", String(page));
    const res = await fetch(`${VAM_BASE}/objects/search?${params}`, {
      cache: "no-store",
    });
    if (!res.ok) break;
    const json = (await res.json()) as VamSearchResponse;
    for (const r of json.records ?? []) {
      const id = r.systemNumber?.trim();
      if (!id || !r._primaryImageId) continue;
      if (!byId.has(id)) {
        byId.set(id, poolArtistFromVamSearchRecord(r));
      }
    }
    const pages = json.info?.pages ?? POOL_MAX_PAGES;
    if (page >= pages) break;
    await sleep(45);
  }

  return [...byId.entries()].map(([objectId, poolArtist]) => ({
    objectId,
    poolArtist,
  }));
}

/** Keyword search per artist (images only) for the `popular` pool. */
export async function collectVamObjectIdsForPopularPool(
  artistNames: readonly string[],
  maxPagesPerName = 20,
): Promise<PopularPoolIngestRow[]> {
  const out: PopularPoolIngestRow[] = [];
  const seen = new Set<string>();
  for (const raw of artistNames) {
    const q = raw.trim();
    if (!q) continue;
    for (let page = 1; page <= maxPagesPerName; page++) {
      const params = new URLSearchParams();
      params.set("q", q);
      params.set("images_exist", "1");
      params.set("page_size", String(POOL_PAGE_SIZE));
      params.set("page", String(page));
      const res = await fetch(`${VAM_BASE}/objects/search?${params}`, {
        cache: "no-store",
      });
      if (!res.ok) break;
      const json = (await res.json()) as VamSearchResponse;
      const rows = json.records ?? [];
      if (rows.length === 0) break;
      for (const r of rows) {
        const id = r.systemNumber?.trim();
        if (!id || !r._primaryImageId) continue;
        if (!popularPoolSearchHitMatchesArtist(q, poolArtistFromVamSearchRecord(r) ?? ""))
          continue;
        const composite = `vam:${id}`;
        if (seen.has(composite)) continue;
        seen.add(composite);
        out.push({ compositeObjectId: composite, poolArtist: q });
      }
      const pages = json.info?.pages ?? maxPagesPerName;
      if (page >= pages) break;
      await sleep(45);
    }
    await sleep(45);
  }
  return out;
}

async function vamSearchPageIds(
  keyword: string,
  page: number,
): Promise<string[]> {
  const params = new URLSearchParams();
  params.set("q", keyword);
  params.set("images_exist", "1");
  params.set("page_size", "80");
  params.set("page", String(page));
  const res = await fetch(`${VAM_BASE}/objects/search?${params}`, {
    cache: "no-store",
  });
  if (!res.ok) return [];
  const json = (await res.json()) as VamSearchResponse;
  return (json.records ?? [])
    .map((r) => r.systemNumber?.trim())
    .filter((id): id is string => Boolean(id));
}

async function vamUnfilteredPageIds(page: number): Promise<string[]> {
  const params = new URLSearchParams();
  params.set("images_exist", "1");
  params.set("page_size", "80");
  params.set("page", String(page));
  const res = await fetch(`${VAM_BASE}/objects/search?${params}`, {
    cache: "no-store",
  });
  if (!res.ok) return [];
  const json = (await res.json()) as VamSearchResponse;
  return (json.records ?? [])
    .map((r) => r.systemNumber?.trim())
    .filter((id): id is string => Boolean(id));
}

async function pickRandomVamId(exclude: Set<string>): Promise<string | null> {
  for (let attempt = 0; attempt < 22; attempt++) {
    const useKeyword = Math.random() < 0.65;
    let ids: string[];
    if (useKeyword) {
      const kw =
        SEARCH_TERMS[Math.floor(Math.random() * SEARCH_TERMS.length)]!;
      const maxPage = Math.min(
        POOL_MAX_PAGES,
        Math.floor(Math.random() * 55) + 1,
      );
      ids = await vamSearchPageIds(kw, maxPage);
    } else {
      const maxPage = Math.min(
        POOL_MAX_PAGES,
        Math.floor(Math.random() * 55) + 1,
      );
      ids = await vamUnfilteredPageIds(maxPage);
    }
    if (ids.length === 0) continue;
    const candidates = [...ids];
    shuffleInPlace(candidates);
    for (const id of candidates) {
      if (!exclude.has(`vam:${id}`)) return id;
    }
  }
  return null;
}

export async function getRandomVamSlots(
  count: number,
  excludeIds: Iterable<string>,
): Promise<WallSlotPayload[]> {
  const exclude = new Set(excludeIds);
  const out: WallSlotPayload[] = [];
  let guard = 0;
  const usePool = (await artPoolCount("vam")) > 0;

  while (out.length < count && guard < count * 100) {
    guard++;
    const need = count - out.length;

    if (usePool) {
      const ids = await pickRandomObjectIdsFromPool("vam", exclude, need);
      if (ids.length > 0) {
        const fetched = await Promise.all(ids.map((oid) => fetchVamObject(oid)));
        for (let i = 0; i < fetched.length; i++) {
          const slot = fetched[i];
          const oid = ids[i]!;
          if (!slot) {
            exclude.add(`vam:${oid}`);
            continue;
          }
          exclude.add(`vam:${slot.objectId}`);
          out.push(slot);
        }
        continue;
      }
    }

    const id = await pickRandomVamId(exclude);
    if (!id) break;
    const slot = await fetchVamObject(id);
    if (!slot) {
      exclude.add(`vam:${id}`);
      continue;
    }
    exclude.add(`vam:${slot.objectId}`);
    out.push(slot);
  }

  return out;
}
