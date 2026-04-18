import { getRandomArticSlots } from "./artic";
import { getRandomClevelandSlots } from "./cleveland";
import { getRandomHarvardSlots, isHarvardConfigured } from "./harvard";
import { getRandomMetSlots } from "./met";
import { getRandomMplusSlots } from "./mplus";
import { getRandomGettySlots } from "./getty";
import { getRandomNglSlots } from "./ngl";
import { getRandomRijksSlots } from "./rijks";
import { getRandomVamSlots } from "./vam";
import { getRandomWhitneySlots } from "./whitney";
import { getRandomNmaSlots } from "./nma";
import { getRandomCooperSlots } from "./cooper";
import type { ArtSourceId, WallSlotPayload } from "./types";
import { slotCompositeKey } from "./types";

/** Museums included in random wall/deck sampling (production). */
function availableSources(): ArtSourceId[] {
  const base: ArtSourceId[] = [
    "artic",
    "met",
    "cleveland",
    "whitney",
    "rijks",
    "ngl",
    "getty",
    "vam",
    "mplus",
    "nma",
    "cooper",
  ];
  if (isHarvardConfigured()) base.push("harvard");
  return base;
}

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

async function slotsFromSource(
  src: ArtSourceId,
  exclude: Set<string>,
  n: number,
): Promise<WallSlotPayload[]> {
  switch (src) {
    case "artic":
      return getRandomArticSlots(n, exclude);
    case "met":
      return getRandomMetSlots(n, exclude);
    case "cleveland":
      return getRandomClevelandSlots(n, exclude);
    case "harvard":
      return getRandomHarvardSlots(n, exclude);
    case "whitney":
      return getRandomWhitneySlots(n, exclude);
    case "rijks":
      return getRandomRijksSlots(n, exclude);
    case "ngl":
      return getRandomNglSlots(n, exclude);
    case "getty":
      return getRandomGettySlots(n, exclude);
    case "vam":
      return getRandomVamSlots(n, exclude);
    case "mplus":
      return getRandomMplusSlots(n, exclude);
    case "nma":
      return getRandomNmaSlots(n, exclude);
    case "cooper":
      return getRandomCooperSlots(n, exclude);
    default:
      return [];
  }
}

/**
 * Tries other sources in order when the preferred one cannot produce a card (pool/API).
 */
async function tryFillOneSlot(
  exclude: Set<string>,
  order: ArtSourceId[],
  startIdx: number,
): Promise<WallSlotPayload | null> {
  for (let step = 0; step < order.length; step++) {
    const src = order[(startIdx + step) % order.length]!;
    const batch = await slotsFromSource(src, exclude, 1);
    if (batch.length > 0) return batch[0]!;
  }
  return null;
}

/** Up to 20 attempts against one source; used so each round-robin chunk can run primaries in parallel. */
async function fillPrimarySlot(
  src: ArtSourceId,
  exclude: Set<string>,
): Promise<WallSlotPayload | null> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const batch = await slotsFromSource(src, exclude, 1);
    if (batch.length > 0) return batch[0]!;
  }
  return null;
}

/**
 * Fetches random artwork cards with **equal representation per session**: the active museums
 * are shuffled into a random order once, then card *i* comes from `order[i % N]` (strict
 * round-robin through that order, repeating as needed). So with 12 sources and 12 cards you
 * get exactly one card per museum; with 6 cards you get the first six museums in the shuffled order.
 *
 * `excludeIds` entries must be composite keys: `source:objectId` (e.g. `artic:23119`, `met:45734`).
 */
export async function getRandomArtSlots(
  count: number,
  excludeIds: Iterable<string>,
): Promise<WallSlotPayload[]> {
  const exclude = new Set(excludeIds);
  const order = [...availableSources()];
  shuffleInPlace(order);
  if (count <= 0 || order.length === 0) return [];

  const n = order.length;
  const out: WallSlotPayload[] = [];

  /**
   * Process in chunks of at most `n` slots. Within a chunk, each museum appears at most once
   * (consecutive indices mod n), so primary fetches can run in parallel with the same `exclude`
   * snapshot. Fallbacks run sequentially so `exclude` stays consistent.
   */
  let idx = 0;
  while (idx < count) {
    const chunkLen = Math.min(n, count - idx);
    const chunkIndices = Array.from({ length: chunkLen }, (_, j) => idx + j);

    const primaryResults = await Promise.all(
      chunkIndices.map((i) => fillPrimarySlot(order[i % n]!, exclude)),
    );

    for (let j = 0; j < chunkLen; j++) {
      const i = idx + j;
      let card: WallSlotPayload | null = primaryResults[j] ?? null;
      if (!card) {
        card = await tryFillOneSlot(exclude, order, i % n);
      }
      if (!card) return out;

      exclude.add(slotCompositeKey(card));
      out.push(card);
    }

    idx += chunkLen;
  }

  return out;
}
