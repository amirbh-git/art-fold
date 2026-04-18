import { getRandomArticSlots } from "./artic";
import { getRandomClevelandSlots } from "./cleveland";
import { getRandomHarvardSlots, isHarvardConfigured } from "./harvard";
import type { ArtSourceId, WallSlotPayload } from "./types";
import { slotCompositeKey } from "./types";

function availableSources(): ArtSourceId[] {
  const base: ArtSourceId[] = ["artic", "cleveland"];
  if (isHarvardConfigured()) base.push("harvard");
  return base;
}

/** Split `total` into `parts` non-negative integers that sum to `total`. */
function splitCounts(total: number, parts: number): number[] {
  if (parts <= 0) return [];
  const base = Math.floor(total / parts);
  const rem = total % parts;
  return Array.from({ length: parts }, (_, i) => base + (i < rem ? 1 : 0));
}

async function tryOneSequentialSlot(
  exclude: Set<string>,
  sources: ArtSourceId[],
  rr: number,
): Promise<WallSlotPayload | null> {
  for (let step = 0; step < sources.length; step++) {
    const src = sources[(rr + step) % sources.length]!;
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
    if (batch.length > 0) return batch[0]!;
  }
  return null;
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
  if (count <= 0 || sources.length === 0) return [];

  const quotas = splitCounts(count, sources.length);
  const batches = await Promise.all(
    sources.map((src, i) => {
      const n = quotas[i] ?? 0;
      switch (src) {
        case "artic":
          return getRandomArticSlots(n, exclude);
        case "cleveland":
          return getRandomClevelandSlots(n, exclude);
        case "harvard":
          return getRandomHarvardSlots(n, exclude);
        default:
          return Promise.resolve([] as WallSlotPayload[]);
      }
    }),
  );

  const pointers = batches.map(() => 0);
  const start = Math.floor(Math.random() * sources.length);
  const out: WallSlotPayload[] = [];

  for (let k = 0; k < count; k++) {
    let placed = false;
    for (let tryStep = 0; tryStep < sources.length; tryStep++) {
      const srcIdx = (start + k + tryStep) % sources.length;
      const batch = batches[srcIdx]!;
      const p = pointers[srcIdx]!;
      if (p < batch.length) {
        out.push(batch[p]!);
        pointers[srcIdx] = p + 1;
        placed = true;
        break;
      }
    }
    if (!placed) break;
  }

  const used = new Set(exclude);
  for (const c of out) used.add(slotCompositeKey(c));

  let rr = (start + out.length) % sources.length;
  let guard = 0;
  while (out.length < count && guard < count * 150) {
    guard++;
    const card = await tryOneSequentialSlot(used, sources, rr);
    rr++;
    if (!card) break;
    out.push(card);
    used.add(slotCompositeKey(card));
  }

  return out;
}
