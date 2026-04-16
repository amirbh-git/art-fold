import type { MetCardFilters } from "@/lib/met-filters";
import { DEFAULT_MET_CARD_FILTERS } from "@/lib/met-filters";
import { getRandomArticSlots } from "./artic";
import { getRandomClevelandSlots } from "./cleveland";
import { getRandomHarvardSlots, isHarvardConfigured } from "./harvard";
import { getRandomMetSlots } from "./met";
import type { ArtSourceId, WallSlotPayload } from "./types";

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function availableSources(): ArtSourceId[] {
  const base: ArtSourceId[] = ["met", "artic", "cleveland"];
  if (isHarvardConfigured()) base.push("harvard");
  return base;
}

/**
 * Fetches random artwork cards from The Met, Art Institute of Chicago,
 * Cleveland Museum of Art, and (when `HARVARD_ART_API_KEY` is set) Harvard Art Museums.
 * `excludeIds` entries must be composite keys: `source:objectId` (e.g. `met:437299`, `artic:23119`).
 * Met department/era/medium/region filters apply only to Met-backed cards.
 */
export async function getRandomArtSlots(
  count: number,
  excludeIds: Iterable<string>,
  filters: MetCardFilters = DEFAULT_MET_CARD_FILTERS,
): Promise<WallSlotPayload[]> {
  const exclude = new Set(excludeIds);
  const sources = availableSources();
  const out: WallSlotPayload[] = [];
  let guard = 0;

  while (out.length < count && guard < count * 150) {
    guard++;
    const pool = [...sources];
    shuffleInPlace(pool);
    const src = pool[0]!;
    let batch: WallSlotPayload[] = [];

    switch (src) {
      case "met":
        batch = await getRandomMetSlots(1, exclude, filters);
        break;
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
