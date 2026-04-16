/**
 * User-facing art filters for Met Collection search.
 * Empty array for a dimension = “all options enabled” (widest behavior for that axis).
 */

export type MetCardFilters = {
  departmentIds: number[];
  eraIds: string[];
  mediumIds: string[];
  regionIds: string[];
};

export const DEFAULT_MET_CARD_FILTERS: MetCardFilters = {
  departmentIds: [],
  eraIds: [],
  mediumIds: [],
  regionIds: [],
};

export const DEPARTMENT_OPTIONS: readonly {
  id: string;
  departmentId: number;
  label: string;
}[] = [
  { id: "ep", departmentId: 11, label: "European Paintings" },
  { id: "modern", departmentId: 21, label: "Modern Art" },
  { id: "lehman", departmentId: 15, label: "Robert Lehman Collection" },
  { id: "drawings", departmentId: 9, label: "Drawings and Prints" },
] as const;

export const ERA_OPTIONS: readonly {
  id: string;
  label: string;
  dateBegin: number;
  dateEnd: number;
}[] = [
  { id: "pre1600", label: "Before 1600", dateBegin: -2000, dateEnd: 1599 },
  { id: "c1600", label: "1600–1799", dateBegin: 1600, dateEnd: 1799 },
  { id: "c1800", label: "1800–1899", dateBegin: 1800, dateEnd: 1899 },
  { id: "c1900", label: "1900–1945", dateBegin: 1900, dateEnd: 1945 },
  { id: "post1945", label: "After 1945", dateBegin: 1946, dateEnd: 2030 },
] as const;

export const MEDIUM_OPTIONS: readonly { id: string; value: string; label: string }[] =
  [
    { id: "paintings", value: "Paintings", label: "Paintings" },
    { id: "drawings", value: "Drawings", label: "Drawings" },
    { id: "prints", value: "Prints", label: "Prints" },
  ] as const;

export const REGION_OPTIONS: readonly { id: string; geoLocation: string; label: string }[] =
  [
    { id: "europe", geoLocation: "Europe", label: "Europe" },
    { id: "france", geoLocation: "France", label: "France" },
    { id: "italy", geoLocation: "Italy", label: "Italy" },
    { id: "spain", geoLocation: "Spain", label: "Spain" },
    { id: "uk", geoLocation: "United Kingdom", label: "United Kingdom" },
    { id: "netherlands", geoLocation: "Netherlands", label: "Netherlands" },
    { id: "germany", geoLocation: "Germany", label: "Germany" },
    { id: "us", geoLocation: "United States", label: "United States" },
    { id: "china", geoLocation: "China", label: "China" },
    { id: "japan", geoLocation: "Japan", label: "Japan" },
  ] as const;

/**
 * Substrings matched against artist nationality, country, culture, and bio (lowercased).
 * Met's search `geoLocation` is too strict combined with dept/medium/q — we filter in-app instead.
 */
export const REGION_MATCH_HINTS: Record<string, readonly string[]> = {
  europe: [
    "europe",
    "european",
    "flemish",
    "italian",
    "french",
    "german",
    "spanish",
    "british",
    "english",
    "scottish",
    "welsh",
    "irish",
    "dutch",
    "swiss",
    "austrian",
    "belgian",
    "portuguese",
    "russian",
    "polish",
    "swedish",
    "norwegian",
    "danish",
    "finnish",
    "greek",
    "bohemian",
    "venetian",
    "flanders",
    "netherlandish",
  ],
  france: ["france", "french", "paris", "normandy", "brittany", "burgundy", "lyon", "marseille"],
  italy: ["italy", "italian", "rome", "venice", "florence", "milan", "naples", "sicily", "tuscan"],
  spain: ["spain", "spanish", "madrid", "seville", "barcelona", "castile", "catalan"],
  uk: [
    "british",
    "english",
    "scottish",
    "welsh",
    "irish",
    "united kingdom",
    "london",
    "yorkshire",
    "cornwall",
  ],
  netherlands: ["netherlands", "dutch", "holland", "amsterdam", "haag", "flemish", "antwerp"],
  germany: ["germany", "german", "bavarian", "prussian", "berlin", "munich", "cologne"],
  us: ["american", "united states", "u.s.", "boston", "philadelphia", "new york", "chicago"],
  china: ["china", "chinese", "ming", "qing", "beijing", "cantonese"],
  japan: ["japan", "japanese", "edo", "tokyo", "kyoto"],
};

const ALL_DEPT_IDS = DEPARTMENT_OPTIONS.map((d) => d.departmentId);
const ALL_ERA_IDS = new Set(ERA_OPTIONS.map((e) => e.id));
const ALL_MEDIUM_IDS = new Set(MEDIUM_OPTIONS.map((m) => m.id));
const ALL_REGION_IDS = new Set(REGION_OPTIONS.map((r) => r.id));

function parseCsv(param: string | null): string[] {
  if (!param?.trim()) return [];
  return param
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseDeptIds(param: string | null): number[] {
  return parseCsv(param)
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n));
}

export function parseMetCardFiltersFromSearchParams(
  searchParams: URLSearchParams,
): MetCardFilters {
  return {
    departmentIds: parseDeptIds(searchParams.get("departments")),
    eraIds: parseCsv(searchParams.get("eras")),
    mediumIds: parseCsv(searchParams.get("mediums")),
    regionIds: parseCsv(searchParams.get("regions")),
  };
}

export function isAllDepartmentsSelected(ids: readonly number[]): boolean {
  if (ids.length === 0) return true;
  const set = new Set(ids);
  return ALL_DEPT_IDS.every((id) => set.has(id));
}

export function isAllErasSelected(ids: readonly string[]): boolean {
  if (ids.length === 0) return true;
  const set = new Set(ids);
  return [...ALL_ERA_IDS].every((id) => set.has(id));
}

export function isAllMediumsSelected(ids: readonly string[]): boolean {
  if (ids.length === 0) return true;
  const set = new Set(ids);
  return [...ALL_MEDIUM_IDS].every((id) => set.has(id));
}

export function isAllRegionsSelected(ids: readonly string[]): boolean {
  if (ids.length === 0) return true;
  const set = new Set(ids);
  return [...ALL_REGION_IDS].every((id) => set.has(id));
}

/** Append filter params to URLSearchParams (only non-default / narrowed axes). */
export function appendMetCardFilterParams(
  params: URLSearchParams,
  filters: MetCardFilters,
): void {
  if (
    filters.departmentIds.length > 0 &&
    !isAllDepartmentsSelected(filters.departmentIds)
  ) {
    params.set("departments", filters.departmentIds.join(","));
  }

  if (filters.eraIds.length > 0 && !isAllErasSelected(filters.eraIds)) {
    params.set("eras", filters.eraIds.join(","));
  }

  if (filters.mediumIds.length > 0 && !isAllMediumsSelected(filters.mediumIds)) {
    params.set("mediums", filters.mediumIds.join(","));
  }

  if (filters.regionIds.length > 0 && !isAllRegionsSelected(filters.regionIds)) {
    params.set("regions", filters.regionIds.join(","));
  }
}
