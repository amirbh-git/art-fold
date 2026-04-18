import { artPoolCount, pickRandomObjectIdsFromPool } from "@/lib/art-pool";
import type { WallSlotPayload } from "./types";

/**
 * M+ Museum (Hong Kong) — GraphQL collection API (public; optional bearer for registered keys).
 * Image delivery is not exposed on `Image` in the schema; we take the collection hero URL from the
 * public object page (Cloudinary `v2/prod/` path), which matches the artwork record.
 *
 * @see https://api.mplus.org.hk/en/documentation/about
 */

const GRAPHQL_URL = "https://api.mplus.org.hk/graphql";
const COLLECTION_OBJECT_BASE =
  "https://www.mplus.org.hk/en/collection/objects";

/** First Cloudinary artwork path on the HTML object page (excludes site/marketing assets). */
const CLOUDINARY_ARTWORK_RE =
  /https:\/\/res\.cloudinary\.com\/mplustms\/image\/upload\/[^"'\\\s]+\/v2\/prod\/[^"'\\\s]+\.(?:jpe?g|webp)/gi;

type GqlResponse<T> = { data?: T; errors?: { message?: string }[] };

type MplusObjectRow = {
  id?: number;
  slug?: string;
  title?: string;
  displayDate?: string;
  medium?: string;
  creditLine?: string;
  dimension?: string;
  images?: Array<{ altText?: string | null }>;
  constituents?: Array<{
    name?: string | null;
    role?: string | null;
    isMakerOfObject?: boolean | null;
  }>;
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

function mplusAuthHeaders(): Record<string, string> {
  const token =
    process.env.MPLUS_API_KEY?.trim() ?? process.env.MPLUS_GRAPHQL_BEARER?.trim();
  if (!token) return {};
  return { Authorization: `bearer ${token}` };
}

async function mplusGraphql<T>(
  query: string,
  variables?: Record<string, unknown>,
  options?: { pool?: boolean },
): Promise<T | null> {
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...mplusAuthHeaders(),
    },
    body: JSON.stringify(variables ? { query, variables } : { query }),
    ...(options?.pool
      ? { cache: "no-store" as const }
      : { next: { revalidate: 3600 } }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as GqlResponse<T>;
  if (json.errors?.length) return null;
  return json.data ?? null;
}

function artistFromConstituents(
  rows: MplusObjectRow["constituents"],
): string {
  if (!rows?.length) return "";
  const maker =
    rows.find((c) => c.isMakerOfObject === true) ??
    rows.find((c) => (c.role ?? "").toLowerCase().includes("artist")) ??
    rows[0];
  return (maker?.name ?? "").trim();
}

/**
 * Hero image URL from the public collection page (Cloudinary `v2/prod/`).
 */
function imageUrlFromCollectionHtml(html: string): string | null {
  CLOUDINARY_ARTWORK_RE.lastIndex = 0;
  const m = CLOUDINARY_ARTWORK_RE.exec(html);
  return m?.[0]?.trim() ?? null;
}

export async function fetchMplusArtwork(
  objectId: string,
): Promise<WallSlotPayload | null> {
  const id = Number.parseInt(objectId, 10);
  if (!Number.isFinite(id) || id < 1) return null;

  const q = `query MplusObject($id: Int!) {
    object(id: $id) {
      id
      slug
      title
      displayDate
      medium
      creditLine
      dimension
      images { altText }
      constituents { name role isMakerOfObject }
    }
  }`;

  const data = await mplusGraphql<{ object: MplusObjectRow | null }>(q, {
    id,
  });
  const o = data?.object;
  if (!o?.slug?.trim()) return null;
  if (!o.images?.some((im) => (im.altText ?? "").trim())) return null;

  const pageUrl = `${COLLECTION_OBJECT_BASE}/${encodeURIComponent(o.slug)}/`;
  let html: string;
  try {
    const res = await fetch(pageUrl, {
      headers: { "User-Agent": "digital-exhibit/1.0 (collection embed)" },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    html = await res.text();
  } catch {
    return null;
  }

  const imageUrl = imageUrlFromCollectionHtml(html);
  if (!imageUrl) return null;

  return {
    source: "mplus",
    objectId: String(o.id ?? id),
    title: (o.title ?? "Untitled").trim() || "Untitled",
    artist: artistFromConstituents(o.constituents),
    imageUrl,
    objectUrl: pageUrl,
    objectDate: (o.displayDate ?? "").trim() || undefined,
    medium: (o.medium ?? "").trim() || undefined,
    dimensions: (o.dimension ?? "").trim() || undefined,
    creditLine: (o.creditLine ?? "").trim() || undefined,
  };
}

function parseMaxPages(): number {
  const raw = process.env.MPLUS_POOL_MAX_PAGES?.trim();
  if (raw === undefined || raw === "") return 176;
  if (raw === "0") return Number.POSITIVE_INFINITY;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return 176;
  return n;
}

/**
 * Paginates `objects` (publicAccess) and keeps IDs that have at least one image record.
 * Default **176** pages × 100 ≈ full public index (~17.6k). Override with `MPLUS_POOL_MAX_PAGES`.
 */
export async function collectMplusObjectIdsForPool(): Promise<number[]> {
  const perPage = 100;
  const maxPages = parseMaxPages();
  const all: number[] = [];

  const q = `query MplusObjects($page: Int!, $perPage: Int!) {
    objects(
      page: $page
      per_page: $perPage
      publicAccess: true
      sort: "asc"
      sort_field: "id"
    ) {
      id
      images { altText }
    }
  }`;

  let page = 1;
  while (page <= maxPages) {
    const data = await mplusGraphql<{
      objects: Array<{ id?: number; images?: Array<{ altText?: string | null }> }>;
    }>(q, { page, perPage }, { pool: true });

    const rows = data?.objects ?? [];
    if (rows.length === 0) break;

    for (const row of rows) {
      const oid = row.id;
      if (typeof oid !== "number" || !Number.isFinite(oid)) continue;
      const hasImage = row.images?.some((im) => (im.altText ?? "").trim());
      if (hasImage) all.push(oid);
    }

    page++;
    await sleep(120);
  }

  return all;
}

async function pickRandomMplusId(exclude: Set<string>): Promise<string | null> {
  const maxPage = 176;
  for (let attempt = 0; attempt < 24; attempt++) {
    const page = Math.floor(Math.random() * maxPage) + 1;
    const q = `query R($page: Int!) {
      objects(page: $page, per_page: 80, publicAccess: true, shuffle: true) {
        id
        images { altText }
      }
    }`;
    const data = await mplusGraphql<{
      objects: Array<{ id?: number; images?: Array<{ altText?: string | null }> }>;
    }>(q, { page });
    const rows = data?.objects ?? [];
    const ids = rows
      .filter((r) =>
        r.images?.some((im) => (im.altText ?? "").trim()),
      )
      .map((r) => r.id)
      .filter((id): id is number => typeof id === "number");
    shuffleInPlace(ids);
    for (const id of ids) {
      const sid = String(id);
      if (!exclude.has(`mplus:${sid}`)) return sid;
    }
  }
  return null;
}

export async function getRandomMplusSlots(
  count: number,
  excludeIds: Iterable<string>,
): Promise<WallSlotPayload[]> {
  const exclude = new Set(excludeIds);
  const out: WallSlotPayload[] = [];
  let guard = 0;
  const usePool = (await artPoolCount("mplus")) > 0;

  while (out.length < count && guard < count * 120) {
    guard++;
    const need = count - out.length;

    if (usePool) {
      const ids = await pickRandomObjectIdsFromPool("mplus", exclude, need);
      if (ids.length > 0) {
        const fetched = await Promise.all(ids.map((oid) => fetchMplusArtwork(oid)));
        for (let i = 0; i < fetched.length; i++) {
          const slot = fetched[i];
          const oid = ids[i]!;
          if (!slot) {
            exclude.add(`mplus:${oid}`);
            continue;
          }
          exclude.add(`mplus:${slot.objectId}`);
          out.push(slot);
        }
        continue;
      }
    }

    const id = await pickRandomMplusId(exclude);
    if (!id) break;
    const slot = await fetchMplusArtwork(id);
    if (!slot) {
      exclude.add(`mplus:${id}`);
      continue;
    }
    exclude.add(`mplus:${slot.objectId}`);
    out.push(slot);
  }

  return out;
}
