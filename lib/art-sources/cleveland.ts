import type { WallSlotPayload } from "./types";

const CMA_BASE = "https://openaccess-api.clevelandart.org/api/artworks";

const SEARCH_TERMS = [
  "portrait",
  "landscape",
  "oil",
  "watercolor",
  "still life",
  "figure",
  "church",
  "garden",
  "interior",
  "venice",
  "mother",
  "child",
  "allegory",
  "mythology",
  "american",
  "european",
];

type CmaImages = {
  web?: { url?: string };
};

type CmaArtwork = {
  id?: number;
  title?: string;
  tombstone?: string;
  creation_date?: string;
  technique?: string;
  measurements?: string;
  department?: string;
  url?: string;
  images?: CmaImages | null;
};

type CmaListResponse = {
  data?: CmaArtwork[];
};

type CmaOneResponse = {
  data?: CmaArtwork;
};

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function imageFromArtwork(o: CmaArtwork): string | null {
  const u = o.images?.web?.url?.trim();
  return u || null;
}

export async function fetchClevelandArtwork(
  id: string,
): Promise<WallSlotPayload | null> {
  const res = await fetch(`${CMA_BASE}/${encodeURIComponent(id)}`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  const json = (await res.json()) as CmaOneResponse;
  const o = json.data;
  if (!o?.id) return null;
  const imageUrl = imageFromArtwork(o);
  if (!imageUrl) return null;

  const oid = String(o.id);
  return {
    source: "cleveland",
    objectId: oid,
    title: (o.title ?? "Untitled").trim() || "Untitled",
    artist: "",
    imageUrl,
    objectUrl: (o.url ?? "").trim(),
    objectDate: (o.creation_date ?? "").trim() || undefined,
    medium: (o.technique ?? "").trim() || undefined,
    dimensions: (o.measurements ?? "").trim() || undefined,
    department: (o.department ?? "").trim() || undefined,
    creditLine: (o.tombstone ?? "").trim() || undefined,
  };
}

async function clevelandSearchIds(q: string): Promise<number[]> {
  const params = new URLSearchParams();
  params.set("q", q);
  params.set("has_image", "1");
  params.set("limit", "80");
  const res = await fetch(`${CMA_BASE}/?${params}`, { cache: "no-store" });
  if (!res.ok) return [];
  const json = (await res.json()) as CmaListResponse;
  const rows = json.data ?? [];
  return rows.filter((r) => r.id != null && imageFromArtwork(r)).map((r) => r.id!);
}

async function pickRandomClevelandId(
  exclude: Set<string>,
): Promise<string | null> {
  for (let attempt = 0; attempt < 18; attempt++) {
    const q = SEARCH_TERMS[Math.floor(Math.random() * SEARCH_TERMS.length)]!;
    const ids = await clevelandSearchIds(q);
    if (ids.length === 0) continue;
    const candidates = [...ids];
    shuffleInPlace(candidates);
    for (const id of candidates) {
      const sid = String(id);
      if (!exclude.has(`cleveland:${sid}`)) return sid;
    }
  }
  return null;
}

export async function getRandomClevelandSlots(
  count: number,
  excludeIds: Iterable<string>,
): Promise<WallSlotPayload[]> {
  const exclude = new Set(excludeIds);
  const out: WallSlotPayload[] = [];
  let guard = 0;

  while (out.length < count && guard < count * 100) {
    guard++;
    const id = await pickRandomClevelandId(exclude);
    if (!id) break;
    const slot = await fetchClevelandArtwork(id);
    if (!slot) {
      exclude.add(`cleveland:${id}`);
      continue;
    }
    exclude.add(`cleveland:${slot.objectId}`);
    out.push(slot);
  }

  return out;
}
