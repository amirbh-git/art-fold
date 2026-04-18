import { artPoolCount, pickRandomObjectIdsFromPool } from "@/lib/art-pool";
import { SEARCH_TERMS } from "./search-keywords";
import type { WallSlotPayload } from "./types";

const SEARCH_BASE = "https://data.rijksmuseum.nl/search/collection";

type SearchPage = {
  orderedItems?: Array<{ id?: string }>;
  next?: { id?: string };
  partOf?: { totalItems?: number };
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

function lodNumericIdFromObjectUrl(objectUrl: string): string | null {
  const m = objectUrl.match(/id\.rijksmuseum\.nl\/(\d+)/);
  return m?.[1] ?? null;
}

async function fetchLinkedJsonLd(
  url: string,
): Promise<Record<string, unknown> | null> {
  const res = await fetch(url, {
    headers: { Accept: "application/ld+json" },
    next: { revalidate: 3600 },
  });
  if (!res.ok) return null;
  return (await res.json()) as Record<string, unknown>;
}

function walkForCollectionUrl(doc: unknown): string | null {
  let found: string | null = null;
  const visit = (o: unknown): void => {
    if (typeof o === "string") {
      if (
        /rijksmuseum\.nl\/(en|nl)\/(collection|collectie)\/object\//.test(o)
      ) {
        found = o
          .replace("/nl/", "/en/")
          .replace("/collectie/", "/collection/");
      }
    } else if (Array.isArray(o)) {
      o.forEach(visit);
    } else if (o && typeof o === "object") {
      for (const v of Object.values(o)) visit(v);
    }
  };
  visit(doc);
  return found;
}

function extractObjectNumber(doc: Record<string, unknown>): string | null {
  const visit = (o: unknown): string | null => {
    if (!o || typeof o !== "object") return null;
    if (Array.isArray(o)) {
      for (const x of o) {
        const r = visit(x);
        if (r) return r;
      }
      return null;
    }
    const r = o as Record<string, unknown>;
    if (r.type === "Identifier" && typeof r.content === "string") {
      const c = r.content.trim();
      if (/^[A-Z]{1,4}-[A-Z]-[\w.-]+$/.test(c)) return c;
    }
    for (const v of Object.values(r)) {
      const x = visit(v);
      if (x) return x;
    }
    return null;
  };
  return visit(doc);
}

function extractTitle(doc: Record<string, unknown>): string {
  const candidates: string[] = [];
  const visit = (o: unknown): void => {
    if (!o || typeof o !== "object") return;
    if (Array.isArray(o)) {
      o.forEach(visit);
      return;
    }
    const r = o as Record<string, unknown>;
    if (r.type === "Name" && typeof r.content === "string") {
      const c = r.content.trim();
      if (
        c &&
        c.length < 800 &&
        !/^[A-Z]{1,4}-[A-Z]-[\w.-]+$/.test(c) &&
        !/^\d{1,4}$/.test(c)
      ) {
        candidates.push(c);
      }
    }
    for (const v of Object.values(r)) visit(v);
  };
  visit(doc);
  return candidates[0]?.trim() || "Untitled";
}

function extractArtist(doc: Record<string, unknown>): string {
  const visit = (o: unknown): string | null => {
    if (!o || typeof o !== "object") return null;
    if (Array.isArray(o)) {
      for (const x of o) {
        const a = visit(x);
        if (a) return a;
      }
      return null;
    }
    const r = o as Record<string, unknown>;
    if (r.type === "Person") {
      const n = r.notation;
      if (Array.isArray(n)) {
        for (const x of n) {
          if (
            x &&
            typeof x === "object" &&
            (x as { "@language"?: string })["@language"] === "en" &&
            typeof (x as { "@value"?: string })["@value"] === "string"
          ) {
            return (x as { "@value": string })["@value"].trim();
          }
        }
        for (const x of n) {
          if (
            x &&
            typeof x === "object" &&
            typeof (x as { "@value"?: string })["@value"] === "string"
          ) {
            return (x as { "@value": string })["@value"].trim();
          }
        }
      }
    }
    for (const v of Object.values(r)) {
      const a = visit(v);
      if (a) return a;
    }
    return null;
  };
  return visit(doc) ?? "";
}

async function imageUrlFromHumanMadeObject(
  doc: Record<string, unknown>,
): Promise<string | null> {
  const shows = doc.shows;
  if (!Array.isArray(shows) || !shows[0] || typeof shows[0] !== "object") {
    return null;
  }
  const vId = (shows[0] as { id?: string }).id;
  if (!vId?.trim()) return null;

  const vDoc = await fetchLinkedJsonLd(vId);
  if (!vDoc) return null;

  const dsb = vDoc.digitally_shown_by;
  if (!Array.isArray(dsb) || !dsb[0] || typeof dsb[0] !== "object") {
    return null;
  }
  const doId = (dsb[0] as { id?: string }).id;
  if (!doId?.trim()) return null;

  const doDoc = await fetchLinkedJsonLd(doId);
  if (!doDoc) return null;

  const ap = doDoc.access_point;
  if (!Array.isArray(ap) || !ap[0] || typeof ap[0] !== "object") {
    return null;
  }
  const img = (ap[0] as { id?: string }).id;
  if (img && /^https?:\/\//.test(img)) return img;
  return null;
}

export async function fetchRijksArtwork(
  objectId: string,
): Promise<WallSlotPayload | null> {
  const hmoUrl = `https://id.rijksmuseum.nl/${encodeURIComponent(objectId)}`;
  const doc = await fetchLinkedJsonLd(hmoUrl);
  if (!doc || doc.type !== "HumanMadeObject") return null;

  const imageUrl = await imageUrlFromHumanMadeObject(doc);
  if (!imageUrl) return null;

  const objectUrl =
    walkForCollectionUrl(doc) ??
    (() => {
      const num = extractObjectNumber(doc);
      return num
        ? `https://www.rijksmuseum.nl/en/collection/object/${encodeURIComponent(num)}`
        : hmoUrl;
    })();

  return {
    source: "rijks",
    objectId,
    title: extractTitle(doc),
    artist: extractArtist(doc),
    imageUrl,
    objectUrl,
  };
}

function orderedItemIds(json: SearchPage): string[] {
  const out: string[] = [];
  for (const item of json.orderedItems ?? []) {
    const id = item.id?.trim();
    if (!id) continue;
    const n = lodNumericIdFromObjectUrl(id);
    if (n) out.push(n);
  }
  return out;
}

/**
 * Paginates the Search API (`imageAvailable=true`) and stores Linked Art
 * object ids. No API key. Large totals — see `maxPages`.
 */
export async function collectRijksObjectIdsForPool(
  maxPages = 500,
): Promise<string[]> {
  const all = new Set<string>();
  let url: string | null =
    `${SEARCH_BASE}?imageAvailable=true`;
  let pages = 0;

  while (url && pages < maxPages) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) break;
    const json = (await res.json()) as SearchPage;
    for (const id of orderedItemIds(json)) all.add(id);
    pages++;
    const next = json.next?.id?.trim();
    url = next || null;
    await sleep(40);
  }

  return [...all];
}

async function rijksSearchIdsForDescription(
  description: string,
  nextSteps: number,
): Promise<string[]> {
  let url: string | null = `${SEARCH_BASE}?imageAvailable=true&description=${encodeURIComponent(description)}`;
  for (let s = 0; s <= nextSteps && url; s++) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return [];
    const json = (await res.json()) as SearchPage;
    if (s === nextSteps) return orderedItemIds(json);
    url = json.next?.id?.trim() ?? null;
  }
  return [];
}

async function pickRandomRijksId(exclude: Set<string>): Promise<string | null> {
  for (let attempt = 0; attempt < 22; attempt++) {
    const term =
      SEARCH_TERMS[Math.floor(Math.random() * SEARCH_TERMS.length)]!;
    const steps = Math.floor(Math.random() * 28);
    const ids = await rijksSearchIdsForDescription(term, steps + 1);
    if (ids.length === 0) continue;
    const candidates = [...ids];
    shuffleInPlace(candidates);
    for (const id of candidates) {
      if (!exclude.has(`rijks:${id}`)) return id;
    }
  }
  return null;
}

export async function getRandomRijksSlots(
  count: number,
  excludeIds: Iterable<string>,
): Promise<WallSlotPayload[]> {
  const exclude = new Set(excludeIds);
  const out: WallSlotPayload[] = [];
  let guard = 0;
  const usePool = (await artPoolCount("rijks")) > 0;

  while (out.length < count && guard < count * 100) {
    guard++;
    const need = count - out.length;

    if (usePool) {
      const ids = await pickRandomObjectIdsFromPool("rijks", exclude, need);
      if (ids.length > 0) {
        const fetched = await Promise.all(
          ids.map((oid) => fetchRijksArtwork(oid)),
        );
        for (let i = 0; i < fetched.length; i++) {
          const slot = fetched[i];
          const oid = ids[i]!;
          if (!slot) {
            exclude.add(`rijks:${oid}`);
            continue;
          }
          exclude.add(`rijks:${slot.objectId}`);
          out.push(slot);
        }
        continue;
      }
    }

    const id = await pickRandomRijksId(exclude);
    if (!id) break;
    const slot = await fetchRijksArtwork(id);
    if (!slot) {
      exclude.add(`rijks:${id}`);
      continue;
    }
    exclude.add(`rijks:${slot.objectId}`);
    out.push(slot);
  }

  return out;
}

export { SEARCH_TERMS as RIJKS_SEARCH_TERMS } from "./search-keywords";
