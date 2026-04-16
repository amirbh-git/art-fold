import type { MetCardFilters } from "@/lib/met-filters";
import {
  DEFAULT_MET_CARD_FILTERS,
  DEPARTMENT_OPTIONS,
  ERA_OPTIONS,
  MEDIUM_OPTIONS,
  REGION_MATCH_HINTS,
  REGION_OPTIONS,
  isAllDepartmentsSelected,
  isAllErasSelected,
  isAllMediumsSelected,
  isAllRegionsSelected,
} from "@/lib/met-filters";
import { ART_FILTERS_ENABLED } from "@/lib/feature-flags";
import type { WallSlotPayload } from "./types";

/** When art filters are disabled, ignore all narrow filters (see `lib/feature-flags.ts`). */
function effectiveCardFilters(f: MetCardFilters): MetCardFilters {
  if (ART_FILTERS_ENABLED) return f;
  return DEFAULT_MET_CARD_FILTERS;
}

const MET_BASE = "https://collectionapi.metmuseum.org/public/collection/v1";

/** The three painting-heavy departments that reliably return results. */
const PAINTING_DEPARTMENTS = [11, 21, 15] as const;

const SEARCH_TERMS = [
  "portrait",
  "landscape",
  "still life",
  "figure",
  "church",
  "garden",
  "interior",
  "seascape",
  "forest",
  "dawn",
  "mother",
  "child",
  "saint",
  "allegory",
  "mythology",
  "venice",
  "paris",
  "mountain",
  "river",
  "snow",
  "spring",
  "summer",
  "evening",
  "music",
  "reading",
  "woman",
  "man",
  "family",
  "flowers",
  "sky",
  "night",
  "morning",
];

type MetSearchResponse = {
  objectIDs?: number[];
  total?: number;
};

type MetObjectResponse = {
  objectID?: number;
  title?: string;
  artistDisplayName?: string;
  artistDisplayBio?: string;
  artistNationality?: string;
  country?: string;
  culture?: string;
  primaryImage?: string;
  objectURL?: string;
  classification?: string;
  objectName?: string;
  objectDate?: string;
  medium?: string;
  dimensions?: string;
  department?: string;
  creditLine?: string;
};

/** Matches legacy wall behavior — permissive for Met painting records. */
function isPaintingLike(o: MetObjectResponse): boolean {
  const c = (o.classification ?? "").trim();
  if (!c) return true;
  if (c === "Paintings") return true;
  const n = (o.objectName ?? "").toLowerCase();
  if (n.includes("painting")) return true;
  if (n.includes("panel")) return true;
  return false;
}

type CachedObject = {
  at: number;
  slot: WallSlotPayload | null;
};

const objectCache = new Map<string, CachedObject>();
const CACHE_MS = 60_000;

function mediumCacheKey(mediumValues: string[]): string {
  return [...mediumValues].sort().join("|");
}

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

type ResolvedSearch = {
  departments: number[];
  /** Empty = do not send dateBegin/dateEnd */
  eraBuckets: { dateBegin: number; dateEnd: number }[];
  /** Met medium= values (always non-empty for URL) */
  mediumValues: string[];
};

function resolveMetCardFilters(f: MetCardFilters): ResolvedSearch {
  const allDeptOptions = DEPARTMENT_OPTIONS.map((d) => d.departmentId);

  const departments =
    f.departmentIds.length === 0 || isAllDepartmentsSelected(f.departmentIds)
      ? [...PAINTING_DEPARTMENTS]
      : f.departmentIds.filter((id) => allDeptOptions.includes(id));

  const depts =
    departments.length > 0 ? departments : [...PAINTING_DEPARTMENTS];

  const eraBuckets =
    f.eraIds.length === 0 || isAllErasSelected(f.eraIds)
      ? []
      : ERA_OPTIONS.filter((e) => f.eraIds.includes(e.id)).map((e) => ({
          dateBegin: e.dateBegin,
          dateEnd: e.dateEnd,
        }));

  let mediumValues: string[];
  if (f.mediumIds.length === 0 || isAllMediumsSelected(f.mediumIds)) {
    mediumValues = ["Paintings"];
  } else {
    mediumValues = MEDIUM_OPTIONS.filter((m) => f.mediumIds.includes(m.id)).map(
      (m) => m.value,
    );
  }
  if (mediumValues.length === 0) {
    mediumValues = ["Paintings"];
  }

  return { departments: depts, eraBuckets, mediumValues };
}

function objectMatchesRegionFilter(o: MetObjectResponse, f: MetCardFilters): boolean {
  if (f.regionIds.length === 0 || isAllRegionsSelected(f.regionIds)) return true;

  const hay = [
    o.artistNationality,
    o.country,
    o.culture,
    o.artistDisplayBio,
    o.artistDisplayName,
  ]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const selected = REGION_OPTIONS.filter((r) => f.regionIds.includes(r.id));
  for (const reg of selected) {
    const hints = REGION_MATCH_HINTS[reg.id] ?? [reg.geoLocation.toLowerCase()];
    for (const h of hints) {
      if (hay.includes(h)) return true;
    }
  }
  return false;
}

function regionCacheKey(f: MetCardFilters): string {
  if (f.regionIds.length === 0 || isAllRegionsSelected(f.regionIds)) return "all";
  return [...f.regionIds].sort().join(",");
}

function matchesMediumSelection(
  o: MetObjectResponse,
  mediumValues: string[],
): boolean {
  if (mediumValues.length === 1 && mediumValues[0] === "Paintings") {
    return isPaintingLike(o);
  }

  const clsRaw = (o.classification ?? "").trim();
  const cls = clsRaw.toLowerCase();
  const med = (o.medium ?? "").toLowerCase();
  const name = (o.objectName ?? "").toLowerCase();

  if (mediumValues.includes("Paintings")) {
    if (!clsRaw) return true;
    if (cls === "paintings" || cls.includes("painting")) return true;
    if (name.includes("painting") || name.includes("panel")) return true;
  }
  if (mediumValues.includes("Drawings")) {
    if (cls.includes("draw") || med.includes("draw") || name.includes("draw"))
      return true;
  }
  if (mediumValues.includes("Prints")) {
    if (
      cls.includes("print") ||
      med.includes("etch") ||
      med.includes("engrav") ||
      med.includes("lithograph") ||
      med.includes("woodcut") ||
      name.includes("print")
    ) {
      return true;
    }
  }
  return false;
}

function searchQueryForFilters(q: string, filters: MetCardFilters): string {
  if (!ART_FILTERS_ENABLED) return q;
  if (filters.regionIds.length === 0 || isAllRegionsSelected(filters.regionIds)) {
    return q;
  }
  /** Bias Met text search toward chosen regions so object fetches match region filter sooner. */
  const boost: Record<string, readonly string[]> = {
    france: ["paris", "french", "versailles"],
    italy: ["venice", "florence", "rome"],
    spain: ["madrid", "seville"],
    uk: ["london", "british"],
    netherlands: ["amsterdam", "dutch"],
    germany: ["berlin", "munich"],
    us: ["new york", "american"],
    china: ["beijing", "chinese"],
    japan: ["tokyo", "japanese"],
    europe: ["european", "paris", "venice"],
  };
  const terms = filters.regionIds.flatMap((id) => [...(boost[id] ?? [])]);
  if (terms.length > 0 && Math.random() < 0.45) {
    return terms[Math.floor(Math.random() * terms.length)]!;
  }
  return q;
}

async function metSearchWithFilters(
  q: string,
  filters: MetCardFilters,
): Promise<number[]> {
  const r = resolveMetCardFilters(filters);
  const query = searchQueryForFilters(q, filters);

  const params = new URLSearchParams();
  params.set("q", query);
  params.set("hasImages", "true");
  const dept = r.departments[Math.floor(Math.random() * r.departments.length)]!;
  params.set("departmentId", String(dept));
  /** One medium per request — pipe-OR of all three often yields sparse/empty results vs Met search. */
  const mediumPick =
    r.mediumValues[Math.floor(Math.random() * r.mediumValues.length)]!;
  params.set("medium", mediumPick);

  if (r.eraBuckets.length > 0) {
    const era = r.eraBuckets[Math.floor(Math.random() * r.eraBuckets.length)]!;
    params.set("dateBegin", String(era.dateBegin));
    params.set("dateEnd", String(era.dateEnd));
  }

  /** Region / country: NOT passed as geoLocation — Met search becomes empty too often. Filter in fetchMetObject. */

  const url = `${MET_BASE}/search?${params.toString()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return [];
  const data = (await res.json()) as MetSearchResponse;
  return data.objectIDs ?? [];
}

export async function fetchMetObject(
  objectId: string,
  mediumValues?: string[],
  filters: MetCardFilters = DEFAULT_MET_CARD_FILTERS,
): Promise<WallSlotPayload | null> {
  const f = effectiveCardFilters(filters);
  const mediums =
    mediumValues && mediumValues.length > 0
      ? mediumValues
      : resolveMetCardFilters(f).mediumValues;
  const key = `${objectId}::${mediumCacheKey(mediums)}::${regionCacheKey(f)}`;
  const now = Date.now();
  const cached = objectCache.get(key);
  if (cached && now - cached.at < CACHE_MS) return cached.slot;

  const res = await fetch(`${MET_BASE}/objects/${objectId}`, {
    cache: "no-store",
  });
  if (!res.ok) {
    objectCache.set(key, { at: now, slot: null });
    return null;
  }
  const o = (await res.json()) as MetObjectResponse;
  const image = o.primaryImage?.trim();
  if (!o.objectID || !image) {
    objectCache.set(key, { at: now, slot: null });
    return null;
  }

  if (!matchesMediumSelection(o, mediums)) {
    objectCache.set(key, { at: now, slot: null });
    return null;
  }

  if (!objectMatchesRegionFilter(o, f)) {
    objectCache.set(key, { at: now, slot: null });
    return null;
  }

  const slot: WallSlotPayload = {
    source: "met",
    objectId: String(o.objectID),
    title: (o.title ?? "Untitled").trim() || "Untitled",
    artist: (o.artistDisplayName ?? "").trim(),
    imageUrl: image,
    objectUrl: (o.objectURL ?? "").trim(),
    objectDate: (o.objectDate ?? "").trim() || undefined,
    medium: (o.medium ?? "").trim() || undefined,
    dimensions: (o.dimensions ?? "").trim() || undefined,
    department: (o.department ?? "").trim() || undefined,
    creditLine: (o.creditLine ?? "").trim() || undefined,
    artistBio: (o.artistDisplayBio ?? "").trim() || undefined,
  };
  objectCache.set(key, { at: now, slot });
  return slot;
}

async function pickRandomObjectId(
  exclude: Set<string>,
  filters: MetCardFilters,
): Promise<string | null> {
  for (let attempt = 0; attempt < 22; attempt++) {
    const q = SEARCH_TERMS[Math.floor(Math.random() * SEARCH_TERMS.length)]!;
    const ids = await metSearchWithFilters(q, filters);
    if (ids.length === 0) continue;

    const candidates = [...ids];
    shuffleInPlace(candidates);
    for (const id of candidates) {
      const sid = String(id);
      if (!exclude.has(`met:${sid}`)) return sid;
    }
  }
  return null;
}

export async function getRandomMetSlots(
  count: number,
  excludeIds: Iterable<string>,
  filters: MetCardFilters = DEFAULT_MET_CARD_FILTERS,
): Promise<WallSlotPayload[]> {
  const f = effectiveCardFilters(filters);
  const exclude = new Set(excludeIds);
  const out: WallSlotPayload[] = [];
  let guard = 0;
  let nullPickStreak = 0;
  const r = resolveMetCardFilters(f);
  const mediumForFetch = r.mediumValues;

  while (out.length < count && guard < count * 120) {
    guard++;
    const oid = await pickRandomObjectId(exclude, f);
    if (!oid) {
      nullPickStreak++;
      /** Avoid long sequential Met round-trips when search keeps returning nothing. */
      if (nullPickStreak >= 22) break;
      continue;
    }
    nullPickStreak = 0;
    const slot = await fetchMetObject(oid, mediumForFetch, f);
    if (!slot) {
      exclude.add(`met:${oid}`);
      continue;
    }
    exclude.add(`met:${slot.objectId}`);
    out.push(slot);
  }

  return out;
}
