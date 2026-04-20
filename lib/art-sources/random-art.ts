import { artPoolCount } from "@/lib/art-pool";
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
import { getRandomPopularSlots } from "./popular";
import type { ArtSourceId, WallSlotPayload } from "./types";
import { slotCompositeKey } from "./types";

/** Continue the same museum round-robin across requests (see `/api/exhibits/cards`). */
export type RandomArtDeckSession = {
  sourceOrder: ArtSourceId[];
  /** Global position into the cycle; first card uses `sourceOrder[startIndex % n]`. */
  startIndex: number;
};

/** Museums plus optional `popular` when that pool has rows. */
export async function availableSources(): Promise<ArtSourceId[]> {
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
  if ((await artPoolCount("popular")) > 0) base.push("popular");
  return base;
}

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function isPermutationOf(order: ArtSourceId[], allowed: ArtSourceId[]): boolean {
  if (order.length !== allowed.length) return false;
  const tallied = new Map<string, number>();
  for (const s of allowed) tallied.set(s, (tallied.get(s) ?? 0) + 1);
  for (const s of order) {
    const c = tallied.get(s);
    if (c == null || c < 1) return false;
    tallied.set(s, c - 1);
  }
  return true;
}

/** When `popular` is active it must lead the cycle; other sources are a random permutation. */
function buildFreshSourceOrder(allowed: ArtSourceId[]): ArtSourceId[] {
  const rest = allowed.filter((s) => s !== "popular");
  shuffleInPlace(rest);
  return allowed.includes("popular")
    ? (["popular", ...rest] as ArtSourceId[])
    : rest;
}

function isValidDeckSessionOrder(
  order: ArtSourceId[],
  allowed: ArtSourceId[],
): boolean {
  if (!isPermutationOf(order, allowed)) return false;
  if (allowed.includes("popular") && order[0] !== "popular") return false;
  return true;
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
    case "popular":
      return getRandomPopularSlots(n, exclude);
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
 * Fetches random artwork cards in a round-robin through `sourceOrder`. When `popular` is in
 * {@link availableSources}, it is **always first**; the remaining sources are a fresh random
 * permutation. When `session` is provided, that order (same rules) and `startIndex` continue
 * the cycle across requests.
 *
 * `excludeIds` entries must be composite keys: `source:objectId` (e.g. `artic:23119`, `met:45734`).
 */
export async function getRandomArtSlots(
  count: number,
  excludeIds: Iterable<string>,
  session?: RandomArtDeckSession | null,
): Promise<{
  slots: WallSlotPayload[];
  sourceOrder: ArtSourceId[];
  nextStartIndex: number;
}> {
  const exclude = new Set(excludeIds);
  const allowed = await availableSources();

  let order: ArtSourceId[];
  let startIndex: number;

  if (
    session?.sourceOrder &&
    session.sourceOrder.length > 0 &&
    isValidDeckSessionOrder(session.sourceOrder, allowed)
  ) {
    order = session.sourceOrder;
    startIndex =
      Number.isFinite(session.startIndex) && session.startIndex >= 0
        ? Math.floor(session.startIndex)
        : 0;
  } else {
    order = buildFreshSourceOrder(allowed);
    startIndex = 0;
  }

  if (count <= 0 || order.length === 0) {
    return { slots: [], sourceOrder: order, nextStartIndex: 0 };
  }

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
      chunkIndices.map((i) =>
        fillPrimarySlot(order[(startIndex + i) % n]!, exclude),
      ),
    );

    for (let j = 0; j < chunkLen; j++) {
      const i = idx + j;
      let card: WallSlotPayload | null = primaryResults[j] ?? null;
      if (!card) {
        card = await tryFillOneSlot(exclude, order, (startIndex + i) % n);
      }
      if (!card) {
        return {
          slots: out,
          sourceOrder: order,
          nextStartIndex: n ? (startIndex + out.length) % n : 0,
        };
      }

      exclude.add(slotCompositeKey(card));
      out.push(card);
    }

    idx += chunkLen;
  }

  return {
    slots: out,
    sourceOrder: order,
    nextStartIndex: n ? (startIndex + out.length) % n : 0,
  };
}
