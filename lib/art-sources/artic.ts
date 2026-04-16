import type { WallSlotPayload } from "./types";

const AIC_BASE = "https://api.artic.edu/api/v1";

const SEARCH_TERMS = [
  "portrait",
  "landscape",
  "oil",
  "watercolor",
  "still life",
  "figure",
  "interior",
  "garden",
  "venice",
  "paris",
  "dawn",
  "evening",
  "mother",
  "child",
  "saint",
  "allegory",
  "mythology",
];

type ArtworkSearchHit = {
  id?: number;
  title?: string;
  artist_display?: string;
  image_id?: string | null;
  date_display?: string;
  medium_display?: string;
};

type ArtworkDetail = ArtworkSearchHit & {
  credit_line?: string;
  department_title?: string;
  dimensions?: string;
};

type SearchResponse = {
  data?: ArtworkSearchHit[];
  config?: { iiif_url?: string };
};

type ArtworkResponse = {
  data?: ArtworkDetail;
  config?: { iiif_url?: string };
};

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function iiifImageUrl(iiifBase: string, imageId: string): string {
  const base = iiifBase.replace(/\/$/, "");
  return `${base}/${imageId}/full/843,/0/default.jpg`;
}

export async function fetchArticArtwork(
  id: string,
): Promise<WallSlotPayload | null> {
  const fields = [
    "id",
    "title",
    "artist_display",
    "image_id",
    "date_display",
    "medium_display",
    "credit_line",
    "department_title",
    "dimensions",
  ].join(",");
  const res = await fetch(`${AIC_BASE}/artworks/${id}?fields=${fields}`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  const json = (await res.json()) as ArtworkResponse;
  const o = json.data;
  const iiifBase =
    json.config?.iiif_url?.replace(/\/$/, "") ??
    "https://www.artic.edu/iiif/2";
  if (!o?.id || !o.image_id?.trim()) return null;
  const imageUrl = iiifImageUrl(iiifBase, o.image_id.trim());
  return {
    source: "artic",
    objectId: String(o.id),
    title: (o.title ?? "Untitled").trim() || "Untitled",
    artist: (o.artist_display ?? "").trim(),
    imageUrl,
    objectUrl: `https://www.artic.edu/artworks/${o.id}`,
    objectDate: (o.date_display ?? "").trim() || undefined,
    medium: (o.medium_display ?? "").trim() || undefined,
    dimensions: (o.dimensions ?? "").trim() || undefined,
    department: (o.department_title ?? "").trim() || undefined,
    creditLine: (o.credit_line ?? "").trim() || undefined,
  };
}

async function articSearchIds(q: string): Promise<number[]> {
  const fields =
    "id,title,artist_display,image_id,date_display,medium_display";
  const params = new URLSearchParams();
  params.set("q", q);
  params.set("fields", fields);
  params.set("limit", "80");
  const res = await fetch(`${AIC_BASE}/artworks/search?${params}`, {
    cache: "no-store",
  });
  if (!res.ok) return [];
  const json = (await res.json()) as SearchResponse;
  const rows = json.data ?? [];
  return rows
    .filter((r) => r.id != null && r.image_id)
    .map((r) => r.id!);
}

async function pickRandomArticId(exclude: Set<string>): Promise<string | null> {
  for (let attempt = 0; attempt < 18; attempt++) {
    const q = SEARCH_TERMS[Math.floor(Math.random() * SEARCH_TERMS.length)]!;
    const ids = await articSearchIds(q);
    if (ids.length === 0) continue;
    const candidates = [...ids];
    shuffleInPlace(candidates);
    for (const id of candidates) {
      const sid = String(id);
      if (!exclude.has(`artic:${sid}`)) return sid;
    }
  }
  return null;
}

export async function getRandomArticSlots(
  count: number,
  excludeIds: Iterable<string>,
): Promise<WallSlotPayload[]> {
  const exclude = new Set(excludeIds);
  const out: WallSlotPayload[] = [];
  let guard = 0;

  while (out.length < count && guard < count * 100) {
    guard++;
    const id = await pickRandomArticId(exclude);
    if (!id) break;
    const slot = await fetchArticArtwork(id);
    if (!slot) {
      exclude.add(`artic:${id}`);
      continue;
    }
    exclude.add(`artic:${slot.objectId}`);
    out.push(slot);
  }

  return out;
}
