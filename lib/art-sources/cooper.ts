import { artPoolCount, pickRandomObjectIdsFromPool } from "@/lib/art-pool";
import type { WallSlotPayload } from "./types";

/**
 * Cooper Hewitt, Smithsonian Design Museum — GraphQL collection API (open access; rate-limited).
 *
 * @see https://apidocs.cooperhewitt.org/api-home/
 */

const GRAPHQL_URL = "https://api.cooperhewitt.org/";

type GqlResponse<T> = {
  data?: T;
  errors?: { message?: string }[];
  extensions?: {
    pagination?: {
      hits?: number;
      per_page?: number;
      current_page?: number;
      number_of_pages?: number;
    };
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

/** Cooper Hewitt enforces ~1 req/s without an access key; stay above that between calls. */
function poolPageDelayMs(): number {
  const raw = process.env.COOPER_POOL_PAGE_DELAY_MS?.trim();
  if (raw === undefined || raw === "") return 1100;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 200 ? n : 1100;
}

async function cooperGraphql<T>(
  query: string,
  variables?: Record<string, unknown>,
  options?: { pool?: boolean },
): Promise<{ data: T | null; extensions?: GqlResponse<T>["extensions"] }> {
  const maxAttempts = options?.pool ? 8 : 1;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(GRAPHQL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(variables ? { query, variables } : { query }),
      ...(options?.pool
        ? { cache: "no-store" as const }
        : { next: { revalidate: 3600 } }),
    });

    if (res.status === 429 && options?.pool && attempt < maxAttempts) {
      const ra = Number.parseInt(res.headers.get("retry-after") ?? "1", 10);
      await sleep(Math.min(Math.max(Number.isFinite(ra) ? ra : 1, 1), 30) * 1000);
      continue;
    }

    if (!res.ok) return { data: null };
    const json = (await res.json()) as GqlResponse<T>;
    if (json.errors?.length) return { data: null };
    return { data: json.data ?? null, extensions: json.extensions };
  }
  return { data: null };
}

type IdRow = { type?: string; value?: string };

type MultimediaItem = {
  type?: string;
  large?: { url?: string };
  preview?: { url?: string };
};

function imageUrlFromMultimedia(mm: unknown): string | null {
  if (!Array.isArray(mm)) return null;
  for (const item of mm) {
    if (!item || typeof item !== "object") continue;
    const m = item as MultimediaItem;
    if (m.type && m.type !== "image") continue;
    const u = m.large?.url ?? m.preview?.url;
    if (typeof u === "string" && u.startsWith("http")) return u;
  }
  for (const item of mm) {
    if (!item || typeof item !== "object") continue;
    const m = item as MultimediaItem;
    const u = m.large?.url ?? m.preview?.url;
    if (typeof u === "string" && u.startsWith("http")) return u;
  }
  return null;
}

function titleFromObject(o: {
  summary?: unknown;
  title?: unknown;
}): string {
  if (o.summary && typeof o.summary === "object" && "title" in o.summary) {
    const st = (o.summary as { title?: string }).title?.trim();
    if (st) return st;
  }
  const t = o.title;
  if (Array.isArray(t) && t[0] && typeof t[0] === "object") {
    const v = (t[0] as { value?: string }).value;
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "Untitled";
}

function artistFromMaker(maker: unknown): string {
  if (!Array.isArray(maker) || !maker[0] || typeof maker[0] !== "object")
    return "";
  const summary = (maker[0] as { summary?: unknown }).summary;
  if (summary && typeof summary === "object" && "title" in summary) {
    const t = (summary as { title?: string }).title;
    if (typeof t === "string" && t.trim()) return t.trim();
  }
  return "";
}

function departmentLabel(department: unknown): string | undefined {
  if (!Array.isArray(department) || !department[0]) return undefined;
  const d = department[0];
  if (!d || typeof d !== "object") return undefined;
  const t = (d as { summary?: { title?: string } }).summary?.title;
  return typeof t === "string" && t.trim() ? t.trim() : undefined;
}

function mediumJoined(medium: unknown): string | undefined {
  if (!Array.isArray(medium)) return undefined;
  const parts: string[] = [];
  for (const m of medium) {
    if (m && typeof m === "object" && "value" in m) {
      const v = (m as { value?: string }).value;
      if (typeof v === "string" && v.trim()) parts.push(v.trim());
    }
  }
  return parts.length ? parts.join(", ") : undefined;
}

function dateJoined(date: unknown): string | undefined {
  if (!Array.isArray(date) || !date[0]) return undefined;
  const d = date[0] as { value?: string; from?: string; to?: string };
  if (d.value?.trim()) return d.value.trim();
  if (d.from && d.to && d.from !== d.to) return `${d.from}–${d.to}`;
  return (d.from ?? d.to)?.trim();
}

function dimensionsLabel(measurements: unknown): string | undefined {
  if (!measurements || typeof measurements !== "object") return undefined;
  const dims = (measurements as { dimensions?: unknown }).dimensions;
  if (!Array.isArray(dims) || !dims[0]) return undefined;
  const v = (dims[0] as { value?: string }).value;
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function accessionLine(identifier: unknown): string | undefined {
  if (!Array.isArray(identifier)) return undefined;
  for (const row of identifier) {
    if (!row || typeof row !== "object") continue;
    const r = row as IdRow;
    if (r.type === "accession number" && r.value?.trim()) return r.value.trim();
  }
  return undefined;
}

function collectionObjectUrl(identifier: unknown): string {
  if (!Array.isArray(identifier)) return "https://collection.cooperhewitt.org/";
  let legacy = "";
  let tms = "";
  for (const row of identifier) {
    if (!row || typeof row !== "object") continue;
    const r = row as IdRow;
    if (r.type === "legacy collections online id" && r.value?.trim())
      legacy = r.value.trim();
    if (r.type === "tms id" && r.value?.trim()) tms = r.value.trim();
  }
  const slug = legacy || tms;
  if (!slug) return "https://collection.cooperhewitt.org/";
  return `https://collection.cooperhewitt.org/objects/${encodeURIComponent(slug)}/`;
}

type CooperObjectRow = {
  id?: string;
  title?: unknown;
  summary?: unknown;
  maker?: unknown;
  department?: unknown;
  medium?: unknown;
  date?: unknown;
  measurements?: unknown;
  identifier?: unknown;
  multimedia?: unknown;
};

export async function fetchCooperObject(
  objectId: string,
): Promise<WallSlotPayload | null> {
  const id = objectId.trim();
  if (!id.startsWith("object-")) return null;

  const q = `query CooperObject($id: ID!) {
    object(id: $id) {
      id
      title
      summary
      maker { summary }
      department
      medium
      date
      measurements
      identifier
      multimedia
    }
  }`;

  const { data } = await cooperGraphql<{ object: CooperObjectRow[] | null }>(
    q,
    { id },
  );
  const rows = data?.object;
  const o = rows?.[0];
  if (!o?.id) return null;

  const imageUrl = imageUrlFromMultimedia(o.multimedia);
  if (!imageUrl) return null;

  return {
    source: "cooper",
    objectId: o.id,
    title: titleFromObject(o),
    artist: artistFromMaker(o.maker),
    imageUrl,
    objectUrl: collectionObjectUrl(o.identifier),
    objectDate: dateJoined(o.date),
    medium: mediumJoined(o.medium),
    dimensions: dimensionsLabel(o.measurements),
    department: departmentLabel(o.department),
    creditLine: accessionLine(o.identifier),
  };
}

function parseMaxPages(): number {
  const raw = process.env.COOPER_POOL_MAX_PAGES?.trim();
  if (raw === undefined || raw === "") return 250;
  if (raw === "0") return Number.POSITIVE_INFINITY;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return 250;
  return n;
}

/**
 * Paginates `object(hasImages: true)` (max 250 per page). Override page cap with `COOPER_POOL_MAX_PAGES`.
 * The API backend uses Elasticsearch with `index.max_result_window` 10000, so offset pagination stops
 * before page 40 at size 250 (~9750 rows max per sort order). See Cooper Hewitt GraphQL docs.
 */
export async function collectCooperObjectIdsForPool(): Promise<string[]> {
  const perPage = 250;
  const maxPages = parseMaxPages();
  /** ES max_result_window 10k → at size 250, page 40 exceeds the window (API returns an error). */
  const maxPageElasticsearch = 39;
  const all = new Set<string>();

  let page = 1;
  let totalPages = Number.POSITIVE_INFINITY;

  while (page <= maxPages && page <= totalPages && page <= maxPageElasticsearch) {
    const q = `{ object(size: ${perPage}, page: ${page}, hasImages: true) { id } }`;
    const { data, extensions } = await cooperGraphql<{
      object: Array<{ id?: string }> | null;
    }>(q, undefined, { pool: true });

    const tp = extensions?.pagination?.number_of_pages;
    if (typeof tp === "number" && tp > 0) totalPages = tp;

    const rows = data?.object ?? [];
    if (rows.length === 0) break;
    for (const r of rows) {
      if (r.id) all.add(r.id);
    }
    page++;
    await sleep(poolPageDelayMs());
  }

  return [...all];
}

async function cooperRandomIdsFromSearch(): Promise<string[]> {
  const probe = `{ object(size: 1, page: 1, hasImages: true) { id } }`;
  const { extensions } = await cooperGraphql<{ object: unknown }>(
    probe,
    undefined,
    { pool: true },
  );
  const totalPages = Math.max(
    1,
    extensions?.pagination?.number_of_pages ?? 1,
  );
  const page = 1 + Math.floor(Math.random() * totalPages);
  await sleep(poolPageDelayMs());
  const q = `{ object(size: 80, page: ${page}, hasImages: true) { id } }`;
  const { data } = await cooperGraphql<{
    object: Array<{ id?: string }> | null;
  }>(q, undefined, { pool: true });
  return (data?.object ?? [])
    .map((r) => r.id)
    .filter((x): x is string => typeof x === "string");
}

async function pickRandomCooperId(exclude: Set<string>): Promise<string | null> {
  for (let attempt = 0; attempt < 18; attempt++) {
    const ids = await cooperRandomIdsFromSearch();
    if (ids.length === 0) continue;
    const candidates = [...ids];
    shuffleInPlace(candidates);
    for (const id of candidates) {
      if (!exclude.has(`cooper:${id}`)) return id;
    }
  }
  return null;
}

export async function getRandomCooperSlots(
  count: number,
  excludeIds: Iterable<string>,
): Promise<WallSlotPayload[]> {
  const exclude = new Set(excludeIds);
  const out: WallSlotPayload[] = [];
  let guard = 0;
  const usePool = (await artPoolCount("cooper")) > 0;

  while (out.length < count && guard < count * 100) {
    guard++;
    const need = count - out.length;

    if (usePool) {
      const ids = await pickRandomObjectIdsFromPool("cooper", exclude, need);
      if (ids.length > 0) {
        const fetched = await Promise.all(ids.map((oid) => fetchCooperObject(oid)));
        for (let i = 0; i < fetched.length; i++) {
          const slot = fetched[i];
          const oid = ids[i]!;
          if (!slot) {
            exclude.add(`cooper:${oid}`);
            continue;
          }
          exclude.add(`cooper:${slot.objectId}`);
          out.push(slot);
        }
        continue;
      }
    }

    const id = await pickRandomCooperId(exclude);
    if (!id) break;
    const slot = await fetchCooperObject(id);
    if (!slot) {
      exclude.add(`cooper:${id}`);
      continue;
    }
    exclude.add(`cooper:${slot.objectId}`);
    out.push(slot);
  }

  return out;
}
