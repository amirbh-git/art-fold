import { artPoolCount, pickRandomObjectIdsFromPool } from "@/lib/art-pool";
import { fetchArticArtwork } from "@/lib/art-sources/artic";
import { fetchClevelandArtwork } from "@/lib/art-sources/cleveland";
import { fetchCooperObject } from "@/lib/art-sources/cooper";
import { fetchGettyArtwork } from "@/lib/art-sources/getty";
import { fetchHarvardObject } from "@/lib/art-sources/harvard";
import { fetchMetObject } from "@/lib/art-sources/met";
import { fetchMplusArtwork } from "@/lib/art-sources/mplus";
import { fetchNglObject } from "@/lib/art-sources/ngl";
import { fetchNmaObject } from "@/lib/art-sources/nma";
import { fetchRijksArtwork } from "@/lib/art-sources/rijks";
import { fetchVamObject } from "@/lib/art-sources/vam";
import { fetchWhitneyArtwork } from "@/lib/art-sources/whitney";
import type { ArtSourceId, WallSlotPayload } from "@/lib/art-sources/types";
import { isArtSourceId } from "@/lib/art-sources/types";

type UnderlyingSource = Exclude<ArtSourceId, "popular">;

export function parsePopularCompositeObjectId(composite: string): {
  source: UnderlyingSource;
  objectId: string;
} | null {
  const i = composite.indexOf(":");
  if (i <= 0) return null;
  const source = composite.slice(0, i);
  const objectId = composite.slice(i + 1);
  if (!objectId || source === "popular" || !isArtSourceId(source)) return null;
  return { source: source as UnderlyingSource, objectId };
}

/** Resolve composite `met:123` to the museum `WallSlotPayload` (not re-labeled as popular). */
export async function fetchPopularCompositeUnderlying(
  compositeObjectId: string,
): Promise<WallSlotPayload | null> {
  const parsed = parsePopularCompositeObjectId(compositeObjectId);
  if (!parsed) return null;
  return fetchUnderlyingSlot(parsed.source, parsed.objectId);
}

async function fetchUnderlyingSlot(
  source: UnderlyingSource,
  objectId: string,
): Promise<WallSlotPayload | null> {
  switch (source) {
    case "met":
      return fetchMetObject(objectId);
    case "artic":
      return fetchArticArtwork(objectId);
    case "cleveland":
      return fetchClevelandArtwork(objectId);
    case "harvard":
      return fetchHarvardObject(objectId);
    case "whitney":
      return fetchWhitneyArtwork(objectId);
    case "rijks":
      return fetchRijksArtwork(objectId);
    case "ngl":
      return fetchNglObject(objectId);
    case "getty":
      return fetchGettyArtwork(objectId);
    case "vam":
      return fetchVamObject(objectId);
    case "mplus":
      return fetchMplusArtwork(objectId);
    case "nma":
      return fetchNmaObject(objectId);
    case "cooper":
      return fetchCooperObject(objectId);
    default:
      return null;
  }
}

function wrapPopularSlot(
  inner: WallSlotPayload,
  compositeObjectId: string,
): WallSlotPayload {
  return {
    ...inner,
    source: "popular",
    objectId: compositeObjectId,
  };
}

/**
 * Random cards from the `popular` pool (`source` column `popular`, `objectId` like `met:123`).
 * Pool-only (no live API discovery).
 */
export async function getRandomPopularSlots(
  count: number,
  excludeIds: Iterable<string>,
): Promise<WallSlotPayload[]> {
  if (count <= 0) return [];
  if ((await artPoolCount("popular")) <= 0) return [];

  const exclude = new Set(excludeIds);
  const out: WallSlotPayload[] = [];
  let guard = 0;

  while (out.length < count && guard < count * 80) {
    guard++;
    const need = count - out.length;
    const composites = await pickRandomObjectIdsFromPool(
      "popular",
      exclude,
      need,
    );
    if (composites.length === 0) break;

    for (const composite of composites) {
      const parsed = parsePopularCompositeObjectId(composite);
      if (!parsed) {
        exclude.add(`popular:${composite}`);
        continue;
      }
      const inner = await fetchUnderlyingSlot(parsed.source, parsed.objectId);
      if (!inner) {
        exclude.add(`popular:${composite}`);
        continue;
      }
      const slot = wrapPopularSlot(inner, composite);
      exclude.add(`popular:${composite}`);
      out.push(slot);
    }
  }

  return out;
}
