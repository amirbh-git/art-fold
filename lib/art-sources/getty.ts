import { artPoolCount, pickRandomObjectIdsFromPool } from "@/lib/art-pool";
import type { ArtPoolIngestRow } from "@/lib/art-sources/art-pool-ingest";
import type { PopularPoolIngestRow } from "@/lib/art-sources/popular-pool-types";
import { popularPoolSearchHitMatchesArtist } from "@/lib/art-sources/popular-pool-search-hit-match";
import type { WallSlotPayload } from "./types";

/**
 * J. Paul Getty Museum (Getty Center / Getty Villa) collection API — Linked Art JSON-LD.
 * Pool ingest uses the public SPARQL endpoint; we only include objects typed as **Artwork**
 * (AAT 300133025) with a **main IIIF JPEG** (`media.getty.edu/iiif/image`), i.e. catalog art with
 * collection images — not unrelated image endpoints.
 *
 * @see https://data.getty.edu/museum/collection/docs/
 */

const OBJECT_JSON = "https://data.getty.edu/museum/collection/object";
const SPARQL_URL = "https://data.getty.edu/museum/collection/sparql";

/** Getty "Artwork" classification — limits to curated art objects. */
const AAT_ARTWORK = "http://vocab.getty.edu/aat/300133025";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SparqlJson = {
  results?: {
    bindings?: Array<{
      s?: { type?: string; value?: string };
      lab?: { type?: string; value?: string; datatype?: string };
      c?: { type?: string; value?: string; datatype?: string };
      artist?: { type?: string; value?: string; datatype?: string };
    }>;
  };
};

type GettyJson = Record<string, unknown>;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

export function objectUuidFromGettyUri(uri: string): string | null {
  const prefix = `${OBJECT_JSON}/`;
  if (!uri.startsWith(prefix)) return null;
  const id = uri.slice(prefix.length).split(/[?#]/)[0]!;
  return UUID_RE.test(id) ? id : null;
}

/** SPARQL: artworks with at least one IIIF `representation` JPEG. */
function sparqlArtworkIdsPage(offset: number, limit: number): string {
  return `PREFIX crm: <http://www.cidoc-crm.org/cidoc-crm/>
SELECT DISTINCT ?s WHERE {
  ?s crm:P2_has_type <${AAT_ARTWORK}> .
  ?s crm:P138i_has_representation ?img .
  FILTER (CONTAINS(STR(?img), "iiif/image"))
} ORDER BY ?s
LIMIT ${limit} OFFSET ${offset}`;
}

function sparqlArtworkCount(): string {
  return `PREFIX crm: <http://www.cidoc-crm.org/cidoc-crm/>
SELECT (COUNT(DISTINCT ?s) AS ?c) WHERE {
  ?s crm:P2_has_type <${AAT_ARTWORK}> .
  ?s crm:P138i_has_representation ?img .
  FILTER (CONTAINS(STR(?img), "iiif/image"))
}`;
}

/**
 * Getty rejects long queries on GET (400); batched artist VALUES must use POST.
 */
async function sparqlJson(query: string): Promise<SparqlJson> {
  const res = await fetch(SPARQL_URL, {
    method: "POST",
    headers: {
      Accept: "application/sparql-results+json",
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
    body: new URLSearchParams({ query }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Getty SPARQL ${res.status}`);
  return (await res.json()) as SparqlJson;
}

function bindingsToObjectUris(json: SparqlJson): string[] {
  const rows = json.results?.bindings ?? [];
  const out: string[] = [];
  for (const row of rows) {
    const u = row.s?.value?.trim();
    if (u) out.push(u);
  }
  return out;
}

/** Batched producer labels (VALUES) — fast vs global GROUP BY on the full graph. */
function sparqlArtistLabelsForObjectUris(uris: string[]): string {
  const vals = uris.map((u) => `<${u}>`).join(" ");
  return `PREFIX crm: <http://www.cidoc-crm.org/cidoc-crm/>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?s (SAMPLE(?lab) AS ?artist) WHERE {
  VALUES ?s { ${vals} }
  ?s crm:P108i_was_produced_by ?root .
  {
    ?root crm:P14_carried_out_by ?who .
  } UNION {
    ?root crm:P9_consists_of+ ?sub .
    ?sub crm:P14_carried_out_by ?who .
  }
  { ?who skos:prefLabel ?lab . } UNION { ?who rdfs:label ?lab . }
} GROUP BY ?s`;
}

function bindingsToArtistBySubject(json: SparqlJson): Map<string, string> {
  const m = new Map<string, string>();
  for (const row of json.results?.bindings ?? []) {
    const subj = row.s?.value?.trim();
    const lit = row.artist?.value?.trim();
    if (!subj || !lit) continue;
    if (lit.toLowerCase() === "unknown") continue;
    m.set(subj, lit);
  }
  return m;
}

async function fetchArtworkCount(): Promise<number> {
  try {
    const json = await sparqlJson(sparqlArtworkCount());
    const lit = json.results?.bindings?.[0]?.c?.value;
    if (lit == null) return 0;
    const n = Number.parseInt(String(lit), 10);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function getPreferredTitle(obj: GettyJson): string | null {
  const identified = obj["identified_by"];
  if (!Array.isArray(identified)) return null;
  for (const item of identified) {
    if (!item || typeof item !== "object") continue;
    const o = item as GettyJson;
    if (o["type"] !== "Name") continue;
    const content = o["content"];
    if (typeof content !== "string") continue;
    const classified = o["classified_as"];
    if (!Array.isArray(classified)) continue;
    for (const c of classified) {
      if (
        c &&
        typeof c === "object" &&
        (c as GettyJson)["_label"] === "Preferred Term"
      ) {
        return content.trim();
      }
    }
  }
  return null;
}

function isUnknownArtistLabel(s: string): boolean {
  return s.trim().toLowerCase() === "unknown";
}

/**
 * Linked Art `produced_by` (Production): agents on `carried_out_by`, including nested
 * `part` sub-productions (same graph shape as `crm:P9_consists_of` in SPARQL).
 */
function collectArtistLabelsFromProduction(
  prod: GettyJson,
  labels: string[],
): void {
  if (!prod || typeof prod !== "object") return;
  const cob = prod["carried_out_by"];
  const agents: GettyJson[] = Array.isArray(cob)
    ? (cob as GettyJson[])
    : cob && typeof cob === "object"
      ? [cob as GettyJson]
      : [];
  for (const agent of agents) {
    if (!agent || typeof agent !== "object") continue;
    const lab = agent["_label"];
    if (typeof lab === "string" && lab.trim() && !isUnknownArtistLabel(lab)) {
      labels.push(lab.trim());
    }
  }
  const parts = prod["part"];
  if (Array.isArray(parts)) {
    for (const p of parts) {
      collectArtistLabelsFromProduction(p as GettyJson, labels);
    }
  }
}

/**
 * Linked Art `produced_by` (Production) includes `carried_out_by` agents with `_label`.
 * The field may be one object or an array; each production may list multiple agents.
 */
function getArtistLabel(obj: GettyJson): string {
  const pb = obj["produced_by"];
  const productions: GettyJson[] = Array.isArray(pb)
    ? (pb as GettyJson[])
    : pb && typeof pb === "object"
      ? [pb as GettyJson]
      : [];
  const labels: string[] = [];
  for (const prod of productions) {
    collectArtistLabelsFromProduction(prod, labels);
  }
  return [...new Set(labels)].join("; ");
}

function getObjectDate(obj: GettyJson): string | undefined {
  const pb = obj["produced_by"];
  const prod = Array.isArray(pb) ? pb[0] : pb;
  if (!prod || typeof prod !== "object") return undefined;
  const ts = (prod as GettyJson)["timespan"];
  if (!ts || typeof ts !== "object") return undefined;
  const identified = (ts as GettyJson)["identified_by"];
  if (!Array.isArray(identified)) return undefined;
  for (const item of identified) {
    if (!item || typeof item !== "object") continue;
    const o = item as GettyJson;
    if (o["type"] === "Name" && typeof o["content"] === "string") {
      const lab = o["_label"];
      if (lab === "Dates" || lab === "Display Title") {
        const c = o["content"].trim();
        if (c) return c;
      }
    }
  }
  const begin = (ts as GettyJson)["begin_of_the_begin"];
  if (typeof begin === "string" && begin.length >= 4) {
    return begin.slice(0, 4);
  }
  return undefined;
}

function getMediumHint(obj: GettyJson): string | undefined {
  const ca = obj["classified_as"];
  if (!Array.isArray(ca)) return undefined;
  const labels: string[] = [];
  for (const c of ca) {
    if (!c || typeof c !== "object") continue;
    const lab = (c as GettyJson)["_label"];
    if (typeof lab !== "string") continue;
    if (
      lab === "Artwork" ||
      lab.startsWith("Object Record Structure") ||
      lab === "Whole"
    ) {
      continue;
    }
    labels.push(lab);
  }
  if (labels.length === 0) return undefined;
  return labels.slice(0, 3).join("; ");
}

/**
 * Main collection image: IIIF JPEG on media.getty.edu, excluding license/badge icons.
 */
function getMainImageUrl(obj: GettyJson): string | null {
  const reps = obj["representation"];
  if (!Array.isArray(reps)) return null;
  for (const r of reps) {
    if (!r || typeof r !== "object") continue;
    const o = r as GettyJson;
    const id = o["id"];
    if (typeof id !== "string") continue;
    if (!id.includes("media.getty.edu/iiif/image")) continue;
    if (id.includes("/licensing/") || id.includes("display-icon")) continue;
    const fmt = o["format"];
    if (fmt === "image/jpeg" || /\.jpe?g($|\?)/i.test(id)) return id;
  }
  return null;
}

function getCollectionPageUrl(obj: GettyJson): string | null {
  const identified = obj["identified_by"];
  if (!Array.isArray(identified)) return null;
  let dor: string | null = null;
  let slug: string | null = null;
  for (const item of identified) {
    if (!item || typeof item !== "object") continue;
    const o = item as GettyJson;
    const lab = o["_label"];
    const content = o["content"];
    if (lab === "Getty DOR ID" && typeof content === "string") {
      dor = content.trim();
    }
    if (lab === "Slug Identifier" && typeof content === "string") {
      const m = content.match(/slug\/([^/\s]+)/);
      if (m?.[1]) slug = m[1]!;
    }
  }
  if (slug) return `https://www.getty.edu/art/collection/object/${slug}`;
  if (dor) return `https://www.getty.edu/art/collection/objects/${dor}`;
  return null;
}

function wallSlotFromJson(
  objectId: string,
  obj: GettyJson,
): WallSlotPayload | null {
  if (obj["type"] !== "HumanMadeObject") return null;
  const imageUrl = getMainImageUrl(obj);
  if (!imageUrl) return null;
  const title = getPreferredTitle(obj)?.trim() || (obj["_label"] as string);
  const objectUrl = getCollectionPageUrl(obj) ?? `${OBJECT_JSON}/${objectId}`;
  return {
    source: "getty",
    objectId,
    title: title?.trim() || "Untitled",
    artist: getArtistLabel(obj),
    imageUrl,
    objectUrl,
    objectDate: getObjectDate(obj),
    medium: getMediumHint(obj),
  };
}

export async function fetchGettyArtwork(
  objectId: string,
): Promise<WallSlotPayload | null> {
  if (!UUID_RE.test(objectId)) return null;
  const res = await fetch(`${OBJECT_JSON}/${encodeURIComponent(objectId)}`, {
    headers: { Accept: "application/json" },
    next: { revalidate: 3600 },
  });
  if (!res.ok) return null;
  const obj = (await res.json()) as GettyJson;
  return wallSlotFromJson(objectId, obj);
}

/**
 * Walks the SPARQL index of **Artwork** objects with IIIF collection images.
 * The endpoint is slow (~tens of seconds per page); cap pages via `GETTY_POOL_MAX_PAGES`
 * (default **36** → 7,200 IDs at page size 200). Set `GETTY_POOL_MAX_PAGES=0` for no cap
 * (full crawl — can take hours).
 */
function parseMaxPages(): number {
  const raw = process.env.GETTY_POOL_MAX_PAGES?.trim();
  if (raw === undefined || raw === "") return 36;
  if (raw === "0") return Number.POSITIVE_INFINITY;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return 36;
  return n;
}

const GETTY_ARTIST_VALUES_CHUNK =
  Number.parseInt(process.env.GETTY_POOL_ARTIST_CHUNK ?? "35", 10) || 35;

export async function collectGettyObjectIdsForPool(): Promise<ArtPoolIngestRow[]> {
  const pageSize = 200;
  const maxPages = parseMaxPages();

  const out: ArtPoolIngestRow[] = [];
  let offset = 0;
  let pages = 0;

  while (pages < maxPages) {
    let json: SparqlJson;
    try {
      json = await sparqlJson(sparqlArtworkIdsPage(offset, pageSize));
    } catch {
      break;
    }
    const uris = bindingsToObjectUris(json);
    if (uris.length === 0) break;

    for (let i = 0; i < uris.length; i += GETTY_ARTIST_VALUES_CHUNK) {
      const chunk = uris.slice(i, i + GETTY_ARTIST_VALUES_CHUNK);
      let labels = new Map<string, string>();
      try {
        const aj = await sparqlJson(sparqlArtistLabelsForObjectUris(chunk));
        labels = bindingsToArtistBySubject(aj);
      } catch {
        labels = new Map();
      }
      for (const uri of chunk) {
        const id = objectUuidFromGettyUri(uri);
        if (!id) continue;
        const lab = labels.get(uri) ?? null;
        out.push({ objectId: id, poolArtist: lab });
      }
      await sleep(250);
    }

    offset += pageSize;
    pages++;
    await sleep(400);
  }

  return out;
}

function sparqlEscapeForContains(needle: string): string {
  return needle
    .toLowerCase()
    .trim()
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');
}

/**
 * SPARQL filter on producer `skos:prefLabel` / `rdfs:label` (best-effort per artist).
 * Returns empty when the endpoint shape does not match.
 */
export async function collectGettyObjectIdsForPopularPool(
  artistNames: readonly string[],
): Promise<PopularPoolIngestRow[]> {
  const out: PopularPoolIngestRow[] = [];
  const seen = new Set<string>();
  for (const raw of artistNames) {
    const canon = raw.trim();
    const needle = sparqlEscapeForContains(raw);
    if (needle.length < 2) continue;
    const q = `PREFIX crm: <http://www.cidoc-crm.org/cidoc-crm/>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT DISTINCT ?s ?lab WHERE {
  ?s crm:P2_has_type <${AAT_ARTWORK}> .
  ?s crm:P138i_has_representation ?img .
  FILTER (CONTAINS(STR(?img), "iiif/image"))
  ?s crm:P108i_was_produced_by ?root .
  {
    ?root crm:P14_carried_out_by ?who .
  } UNION {
    ?root crm:P9_consists_of+ ?sub .
    ?sub crm:P14_carried_out_by ?who .
  }
  { ?who skos:prefLabel ?lab . } UNION { ?who rdfs:label ?lab . }
  FILTER (CONTAINS(LCASE(STR(?lab)), "${needle}"))
}
LIMIT 400`;
    try {
      const json = await sparqlJson(q);
      for (const row of json.results?.bindings ?? []) {
        const u = row.s?.value?.trim();
        const lab = row.lab?.value?.trim();
        if (!u || !lab) continue;
        if (!popularPoolSearchHitMatchesArtist(canon, lab)) continue;
        const id = objectUuidFromGettyUri(u);
        if (!id) continue;
        const composite = `getty:${id}`;
        if (seen.has(composite)) continue;
        seen.add(composite);
        out.push({ compositeObjectId: composite, poolArtist: canon });
      }
    } catch {
      /* ignore per-artist failures */
    }
    await sleep(400);
  }
  return out;
}

async function pickRandomGettyId(exclude: Set<string>): Promise<string | null> {
  const total = await fetchArtworkCount();
  if (total <= 0) return null;
  const pageSize = 120;
  const maxFrom = Math.max(0, total - pageSize);

  for (let attempt = 0; attempt < 18; attempt++) {
    const from = Math.floor(Math.random() * (maxFrom + 1));
    let json: SparqlJson;
    try {
      json = await sparqlJson(sparqlArtworkIdsPage(from, pageSize));
    } catch {
      continue;
    }
    const uris = bindingsToObjectUris(json);
    const ids = uris
      .map((u) => objectUuidFromGettyUri(u))
      .filter((id): id is string => Boolean(id));
    shuffleInPlace(ids);
    for (const id of ids) {
      if (!exclude.has(`getty:${id}`)) return id;
    }
  }
  return null;
}

export async function getRandomGettySlots(
  count: number,
  excludeIds: Iterable<string>,
): Promise<WallSlotPayload[]> {
  const exclude = new Set(excludeIds);
  const out: WallSlotPayload[] = [];
  let guard = 0;
  const usePool = (await artPoolCount("getty")) > 0;

  while (out.length < count && guard < count * 100) {
    guard++;
    const need = count - out.length;

    if (usePool) {
      const ids = await pickRandomObjectIdsFromPool("getty", exclude, need);
      if (ids.length > 0) {
        const fetched = await Promise.all(ids.map((oid) => fetchGettyArtwork(oid)));
        for (let i = 0; i < fetched.length; i++) {
          const slot = fetched[i];
          const oid = ids[i]!;
          if (!slot) {
            exclude.add(`getty:${oid}`);
            continue;
          }
          exclude.add(`getty:${slot.objectId}`);
          out.push(slot);
        }
        continue;
      }
    }

    const id = await pickRandomGettyId(exclude);
    if (!id) break;
    const slot = await fetchGettyArtwork(id);
    if (!slot) {
      exclude.add(`getty:${id}`);
      continue;
    }
    exclude.add(`getty:${slot.objectId}`);
    out.push(slot);
  }

  return out;
}
