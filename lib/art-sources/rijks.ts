import { artPoolCount, pickRandomObjectIdsFromPool } from "@/lib/art-pool";
import type { ArtPoolIngestRow } from "@/lib/art-sources/art-pool-ingest";
import type { PopularPoolIngestRow } from "@/lib/art-sources/popular-pool-types";
import { popularPoolSearchHitMatchesArtist } from "@/lib/art-sources/popular-pool-search-hit-match";
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

const AAT_LANG_EN = "http://vocab.getty.edu/aat/300388277";
const AAT_LANG_NL = "http://vocab.getty.edu/aat/300388256";
const AAT_PRIMARY_NAME = "http://vocab.getty.edu/aat/300404670";

function personNameFromIdentifiedBy(r: Record<string, unknown>): string | null {
  const identified = r.identified_by;
  if (!Array.isArray(identified)) return null;
  type IdEntry = Record<string, unknown>;
  const names = identified.filter(
    (x): x is IdEntry =>
      Boolean(x) && typeof x === "object" && x.type === "Name" && typeof x.content === "string",
  );
  const isPrimary = (n: IdEntry): boolean => {
    const cl = n.classified_as;
    if (!Array.isArray(cl)) return false;
    return cl.some(
      (t) =>
        t &&
        typeof t === "object" &&
        (t as { id?: string }).id === AAT_PRIMARY_NAME,
    );
  };
  const langIsEn = (n: IdEntry): boolean => {
    const lang = n.language;
    if (!Array.isArray(lang) || !lang[0]) return false;
    return (lang[0] as { id?: string }).id === AAT_LANG_EN;
  };
  const primaryEn = names.find((n) => isPrimary(n) && langIsEn(n));
  const primary = names.find(isPrimary);
  const en = names.find(langIsEn);
  const pick = primaryEn ?? primary ?? en ?? names[0];
  const c = pick?.content;
  return typeof c === "string" ? c.trim() : null;
}

/** English/Dutch attribution lines on the object (Rijks Linked Art). */
function captionFromRijksAttributionObject(content: string): string | null {
  const en = content.match(/(.+?\(mentioned on object\))/i);
  if (en?.[1]) return en[1].trim();
  const nl = content.match(/(.+?\(vermeld op object\))/i);
  if (nl?.[1]) return nl[1].trim();
  return null;
}

function isRijksArtistCaptionLanguage(r: Record<string, unknown>): boolean {
  const lang = r.language;
  if (!Array.isArray(lang) || lang.length === 0) return true;
  const id = (lang[0] as { id?: string })?.id;
  return id === AAT_LANG_EN || id === AAT_LANG_NL;
}

function isEnglishRijksCaption(r: Record<string, unknown>): boolean {
  const lang = r.language;
  if (!Array.isArray(lang) || lang.length === 0) return true;
  return (lang[0] as { id?: string })?.id === AAT_LANG_EN;
}

/**
 * Rijks `HumanMadeObject` docs often reference agents by URI only; creator
 * strings live in `LinguisticObject` nodes under `produced_by`.
 */
function extractArtistFromProducedBy(root: unknown): string | null {
  if (root == null) return null;
  const found: { s: string; en: boolean }[] = [];
  const visit = (o: unknown): void => {
    if (!o || typeof o !== "object") return;
    if (Array.isArray(o)) {
      for (const x of o) visit(x);
      return;
    }
    const r = o as Record<string, unknown>;
    if (r.type === "LinguisticObject" && typeof r.content === "string") {
      const raw = r.content.trim();
      if (
        raw.length > 2 &&
        raw.length < 500 &&
        isRijksArtistCaptionLanguage(r) &&
        !/^after\b/i.test(raw) &&
        !/^naar\b/i.test(raw)
      ) {
        const cap = captionFromRijksAttributionObject(raw);
        if (cap)
          found.push({ s: cap, en: isEnglishRijksCaption(r) });
      }
    }
    if (r.type === "Production") {
      const keys = [
        "referred_to_by",
        "part",
        "assigned_by",
        "technique",
        "timespan",
      ];
      for (const k of keys) {
        if (r[k] != null) visit(r[k]);
      }
      for (const [k, v] of Object.entries(r)) {
        if (k === "type" || keys.includes(k)) continue;
        visit(v);
      }
      return;
    }
    for (const v of Object.values(r)) visit(v);
  };
  visit(root);
  if (found.length === 0) return null;
  found.sort((a, b) => Number(b.en) - Number(a.en) || a.s.length - b.s.length);
  return found[0]?.s ?? null;
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
  const fromProd = extractArtistFromProducedBy(doc.produced_by);
  if (fromProd) return fromProd;

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
      const fromNames = personNameFromIdentifiedBy(r);
      if (fromNames) return fromNames;
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

async function rijksArtistLabelForPool(objectId: string): Promise<string | null> {
  const hmoUrl = `https://id.rijksmuseum.nl/${encodeURIComponent(objectId)}`;
  const doc = await fetchLinkedJsonLd(hmoUrl);
  if (!doc || doc.type !== "HumanMadeObject") return null;
  const a = extractArtist(doc as Record<string, unknown>).trim();
  return a || null;
}

/**
 * Search only returns LOD ids; `poolArtist` needs one Linked Art JSON-LD fetch per object.
 * Tune with `RIJKS_POOL_ARTIST_CONCURRENCY` (default 8) and `RIJKS_POOL_ARTIST_DELAY_MS` (default 50).
 */
async function enrichRijksPoolArtistRows(ids: string[]): Promise<ArtPoolIngestRow[]> {
  const concurrency = Math.min(
    16,
    Math.max(
      2,
      Number.parseInt(process.env.RIJKS_POOL_ARTIST_CONCURRENCY ?? "8", 10) || 8,
    ),
  );
  const delayMs = Math.max(
    0,
    Number.parseInt(process.env.RIJKS_POOL_ARTIST_DELAY_MS ?? "50", 10) || 0,
  );
  const out: ArtPoolIngestRow[] = [];
  for (let base = 0; base < ids.length; base += concurrency) {
    const slice = ids.slice(base, base + concurrency);
    const arts = await Promise.all(slice.map((id) => rijksArtistLabelForPool(id)));
    for (let i = 0; i < slice.length; i++) {
      out.push({ objectId: slice[i]!, poolArtist: arts[i] });
    }
    if (delayMs > 0) await sleep(delayMs);
  }
  return out;
}

/**
 * Paginates the Search API (`imageAvailable=true`) and stores Linked Art
 * object ids. No API key. Large totals — see `maxPages`.
 */
export async function collectRijksObjectIdsForPool(
  maxPages = 500,
): Promise<ArtPoolIngestRow[]> {
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

  return enrichRijksPoolArtistRows([...all]);
}

/** Follows Search API pages for `description=<artist>` (image objects only). */
export async function collectRijksObjectIdsForPopularPool(
  artistNames: readonly string[],
  maxPagesPerArtist = 40,
): Promise<PopularPoolIngestRow[]> {
  const out: PopularPoolIngestRow[] = [];
  const seen = new Set<string>();
  for (const raw of artistNames) {
    const description = raw.trim();
    if (!description) continue;
    let url: string | null =
      `${SEARCH_BASE}?imageAvailable=true&description=${encodeURIComponent(description)}`;
    let pages = 0;
    while (url && pages < maxPagesPerArtist) {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) break;
      const json = (await res.json()) as SearchPage;
      for (const id of orderedItemIds(json)) {
        const label = await rijksArtistLabelForPool(id);
        await sleep(40);
        if (!popularPoolSearchHitMatchesArtist(description, label)) continue;
        const composite = `rijks:${id}`;
        if (seen.has(composite)) continue;
        seen.add(composite);
        out.push({ compositeObjectId: composite, poolArtist: description });
      }
      pages++;
      url = json.next?.id?.trim() ?? null;
      await sleep(40);
    }
    await sleep(40);
  }
  return out;
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
