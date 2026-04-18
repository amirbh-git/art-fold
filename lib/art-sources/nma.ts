import { artPoolCount, pickRandomObjectIdsFromPool } from "@/lib/art-pool";
import { SEARCH_TERMS } from "./search-keywords";
import type { WallSlotPayload } from "./types";

const NMA_OBJECT = "https://data.nma.gov.au/object";

type NmaStillImage = {
  type?: string;
  version?: string;
  identifier?: string;
  hasVersion?: NmaStillImage[] | NmaStillImage;
};

type NmaObject = {
  id?: string;
  title?: string;
  creator?: unknown;
  identifier?: string;
  medium?: unknown;
  extent?: {
    length?: number;
    width?: number;
    height?: number;
    unitText?: string;
  };
  temporal?: unknown;
  collection?: { title?: string } | string;
  physicalDescription?: string;
  hasVersion?: NmaStillImage[] | NmaStillImage;
};

type NmaListResponse = {
  data?: NmaObject[];
  meta?: { results?: number };
};

type NmaOneResponse = {
  data?: NmaObject[];
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function nmaHeaders(): HeadersInit {
  const h: Record<string, string> = { Accept: "application/json" };
  const key = process.env.NMA_API_KEY?.trim();
  if (key) h.apikey = key;
  return h;
}

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function hasVersionRoots(hv: NmaStillImage[] | NmaStillImage | undefined): NmaStillImage[] {
  if (hv == null) return [];
  return Array.isArray(hv) ? hv : [hv];
}

function isLikelyImageUrl(u: string): boolean {
  const s = u.trim().toLowerCase();
  if (!/^https?:\/\//.test(s)) return false;
  if (s.includes("collectionsearch.nma.gov.au") && /\.(jpe?g|png|webp|gif)(\?|$)/.test(s))
    return true;
  return /\.(jpe?g|png|webp|gif)(\?|$)/.test(s);
}

/** Prefer large → preview → thumbnail; recurse nested `hasVersion`. */
function extractBestImageUrl(
  hasVersion: NmaStillImage[] | NmaStillImage | undefined,
): string | null {
  type Cand = { rank: number; url: string };
  const out: Cand[] = [];

  function walk(nodes: NmaStillImage[]): void {
    for (const n of nodes) {
      const id = typeof n.identifier === "string" ? n.identifier.trim() : "";
      if (id && isLikelyImageUrl(id)) {
        const ver = (n.version ?? "").toLowerCase();
        let rank = 5;
        if (ver.includes("large")) rank = 0;
        else if (ver.includes("preview")) rank = 1;
        else if (ver.includes("thumbnail")) rank = 3;
        out.push({
          rank,
          url: id.replace(/^http:\/\//i, "https://"),
        });
      }
      const child = n.hasVersion;
      if (Array.isArray(child)) walk(child);
      else if (child && typeof child === "object") walk([child]);
    }
  }

  walk(hasVersionRoots(hasVersion));
  if (out.length === 0) return null;
  out.sort((a, b) => a.rank - b.rank || a.url.localeCompare(b.url));
  return out[0]!.url;
}

function formatArtist(creator: unknown): string {
  if (typeof creator === "string") return creator.trim();
  if (!Array.isArray(creator)) return "";
  const parts: string[] = [];
  for (const c of creator) {
    if (typeof c === "string") {
      parts.push(c.trim());
    } else if (c && typeof c === "object") {
      const o = c as Record<string, unknown>;
      const t = o.title ?? o.name;
      if (typeof t === "string" && t.trim()) parts.push(t.trim());
    }
  }
  return parts.filter(Boolean).join("; ");
}

function formatMedium(medium: unknown): string | undefined {
  if (typeof medium === "string") return medium.trim() || undefined;
  if (!Array.isArray(medium)) return undefined;
  const titles: string[] = [];
  for (const m of medium) {
    if (m && typeof m === "object") {
      const t = (m as { title?: string }).title;
      if (typeof t === "string" && t.trim()) titles.push(t.trim());
    }
  }
  const s = titles.join(", ");
  return s || undefined;
}

function formatDimensions(extent: NmaObject["extent"]): string | undefined {
  if (!extent || typeof extent !== "object") return undefined;
  const u = (extent.unitText ?? "").trim();
  const parts: string[] = [];
  if (typeof extent.length === "number") parts.push(String(extent.length));
  if (typeof extent.width === "number") parts.push(String(extent.width));
  if (typeof extent.height === "number") parts.push(String(extent.height));
  if (parts.length === 0) return undefined;
  return u ? `${parts.join(" × ")} ${u}` : parts.join(" × ");
}

function formatObjectDate(temporal: unknown): string | undefined {
  if (!Array.isArray(temporal) || temporal.length === 0) return undefined;
  const first = temporal[0];
  if (!first || typeof first !== "object") return undefined;
  const o = first as Record<string, unknown>;
  const title = typeof o.title === "string" ? o.title.trim() : "";
  const start = typeof o.startDate === "string" ? o.startDate.trim() : "";
  if (title) return title;
  if (start) return start;
  return undefined;
}

function formatCreditLine(o: NmaObject): string | undefined {
  const col = o.collection;
  let collectionName = "";
  if (typeof col === "string") collectionName = col.trim();
  else if (col && typeof col === "object" && typeof col.title === "string") {
    collectionName = col.title.trim();
  }
  const acc = typeof o.identifier === "string" ? o.identifier.trim() : "";
  if (collectionName && acc) return `${collectionName} · ${acc}`;
  if (collectionName) return collectionName;
  if (acc) return acc;
  return undefined;
}

export async function fetchNmaObject(id: string): Promise<WallSlotPayload | null> {
  const res = await fetch(`${NMA_OBJECT}/${encodeURIComponent(id)}`, {
    headers: nmaHeaders(),
    next: { revalidate: 3600 },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as NmaOneResponse;
  const o = json.data?.[0];
  if (!o?.id) return null;
  const imageUrl = extractBestImageUrl(o.hasVersion);
  if (!imageUrl) return null;

  const oid = String(o.id);
  const titleRaw = (o.title ?? "").trim();
  return {
    source: "nma",
    objectId: oid,
    title: titleRaw || "Untitled",
    artist: formatArtist(o.creator),
    imageUrl,
    objectUrl: `https://collectionsearch.nma.gov.au/object/${encodeURIComponent(oid)}`,
    objectDate: formatObjectDate(o.temporal),
    medium: formatMedium(o.medium),
    dimensions: formatDimensions(o.extent),
    creditLine: formatCreditLine(o),
  };
}

/** Paginated NMA object IDs (`text` + `media=*` returns `hasVersion` in list rows). */
export async function collectNmaObjectIdsForPool(
  maxPagesPerQuery = 40,
): Promise<string[]> {
  const all = new Set<string>();
  const limit = 100;

  for (const q of SEARCH_TERMS) {
    const probeParams = new URLSearchParams();
    probeParams.set("text", q);
    probeParams.set("media", "*");
    probeParams.set("limit", "1");
    probeParams.set("offset", "0");

    const probeRes = await fetch(`${NMA_OBJECT}?${probeParams}`, {
      headers: nmaHeaders(),
      cache: "no-store",
    });
    await sleep(110);
    if (!probeRes.ok) continue;
    const probeJson = (await probeRes.json()) as NmaListResponse;
    const total = probeJson.meta?.results ?? 0;
    let offset = 0;
    let pages = 0;

    while (offset < total && pages < maxPagesPerQuery) {
      const params = new URLSearchParams();
      params.set("text", q);
      params.set("media", "*");
      params.set("limit", String(limit));
      params.set("offset", String(offset));

      const res = await fetch(`${NMA_OBJECT}?${params}`, {
        headers: nmaHeaders(),
        cache: "no-store",
      });
      await sleep(110);
      if (!res.ok) break;
      const json = (await res.json()) as NmaListResponse;
      const rows = json.data ?? [];
      if (rows.length === 0) break;
      for (const r of rows) {
        if (r.id != null && extractBestImageUrl(r.hasVersion)) all.add(String(r.id));
      }
      offset += limit;
      pages++;
    }
    await sleep(110);
  }

  return [...all];
}

async function nmaSearchIds(q: string): Promise<string[]> {
  const params = new URLSearchParams();
  params.set("text", q);
  params.set("media", "*");
  params.set("limit", "80");
  const maxOff = Math.max(0, 5000 - 80);
  params.set("offset", String(Math.floor(Math.random() * (maxOff + 1))));

  const res = await fetch(`${NMA_OBJECT}?${params}`, {
    headers: nmaHeaders(),
    cache: "no-store",
  });
  if (!res.ok) return [];
  const json = (await res.json()) as NmaListResponse;
  const rows = json.data ?? [];
  return rows
    .filter((r) => r.id != null && extractBestImageUrl(r.hasVersion))
    .map((r) => String(r.id));
}

async function pickRandomNmaId(exclude: Set<string>): Promise<string | null> {
  for (let attempt = 0; attempt < 18; attempt++) {
    const q = SEARCH_TERMS[Math.floor(Math.random() * SEARCH_TERMS.length)]!;
    const ids = await nmaSearchIds(q);
    if (ids.length === 0) continue;
    const candidates = [...ids];
    shuffleInPlace(candidates);
    for (const id of candidates) {
      if (!exclude.has(`nma:${id}`)) return id;
    }
  }
  return null;
}

export async function getRandomNmaSlots(
  count: number,
  excludeIds: Iterable<string>,
): Promise<WallSlotPayload[]> {
  const exclude = new Set(excludeIds);
  const out: WallSlotPayload[] = [];
  let guard = 0;
  const usePool = (await artPoolCount("nma")) > 0;

  while (out.length < count && guard < count * 100) {
    guard++;
    const need = count - out.length;

    if (usePool) {
      const ids = await pickRandomObjectIdsFromPool("nma", exclude, need);
      if (ids.length > 0) {
        const fetched = await Promise.all(ids.map((oid) => fetchNmaObject(oid)));
        for (let i = 0; i < fetched.length; i++) {
          const slot = fetched[i];
          const oid = ids[i]!;
          if (!slot) {
            exclude.add(`nma:${oid}`);
            continue;
          }
          exclude.add(`nma:${slot.objectId}`);
          out.push(slot);
        }
        continue;
      }
    }

    const id = await pickRandomNmaId(exclude);
    if (!id) break;
    const slot = await fetchNmaObject(id);
    if (!slot) {
      exclude.add(`nma:${id}`);
      continue;
    }
    exclude.add(`nma:${slot.objectId}`);
    out.push(slot);
  }

  return out;
}
