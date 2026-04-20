export const ART_SOURCE_IDS = [
  "met",
  "artic",
  "harvard",
  "cleveland",
  "whitney",
  "rijks",
  "ngl",
  "getty",
  "vam",
  "mplus",
  "nma",
  "cooper",
  /** Cross-museum pool; DB `objectId` is `realSource:realId` (e.g. `met:123`). */
  "popular",
] as const;

export type ArtSourceId = (typeof ART_SOURCE_IDS)[number];

export function isArtSourceId(s: unknown): s is ArtSourceId {
  return (
    typeof s === "string" &&
    (ART_SOURCE_IDS as readonly string[]).includes(s)
  );
}

/** Stable key for deduping across museums (numeric IDs can collide between APIs). */
export function slotCompositeKey(slot: {
  source: ArtSourceId;
  objectId: string;
}): string {
  return `${slot.source}:${slot.objectId}`;
}

export type WallSlotPayload = {
  source: ArtSourceId;
  objectId: string;
  title: string;
  artist: string;
  imageUrl: string;
  objectUrl: string;
  objectDate?: string;
  medium?: string;
  dimensions?: string;
  department?: string;
  creditLine?: string;
  artistBio?: string;
};
