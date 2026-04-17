import { getRandomArticSlots } from "./artic";
import { getRandomClevelandSlots } from "./cleveland";
import { getRandomHarvardSlots, isHarvardConfigured } from "./harvard";
import type { ArtSourceId, WallSlotPayload } from "./types";

function availableSources(): ArtSourceId[] {
  const base: ArtSourceId[] = ["artic", "cleveland"];
  if (isHarvardConfigured()) base.push("harvard");
  return base;
}

/**
 * Fetches random artwork cards from the Art Institute of Chicago, Cleveland Museum of Art,
 * and (when `HARVARD_ART_API_KEY` is set) Harvard Art Museums.
 * `excludeIds` entries must be composite keys: `source:objectId` (e.g. `artic:23119`, `cleveland:123`).
 * Uses round-robin across sources (with a random starting offset) so one museum
 * does not dominate the deck and repeats feel less frequent.
 */
export async function getRandomArtSlots(
  count: number,
  excludeIds: Iterable<string>,
): Promise<WallSlotPayload[]> {
  const exclude = new Set(excludeIds);
  const sources = availableSources();
  const out: WallSlotPayload[] = [];
  let guard = 0;
  let rr = Math.floor(Math.random() * sources.length);

  while (out.length < count && guard < count * 150) {
    guard++;
    const src = sources[rr % sources.length]!;
    rr++;
    let batch: WallSlotPayload[] = [];

    switch (src) {
      case "artic":
        batch = await getRandomArticSlots(1, exclude);
        break;
      case "cleveland":
        batch = await getRandomClevelandSlots(1, exclude);
        break;
      case "harvard":
        batch = await getRandomHarvardSlots(1, exclude);
        break;
      default:
        break;
    }

    if (batch.length > 0) {
      out.push(batch[0]!);
    }
  }

  return out;
}
