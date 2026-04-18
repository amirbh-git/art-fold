import { normalizeArtSourceId } from "@/lib/art-sources/copy";
import { displayExhibitTitle } from "@/lib/exhibit-display";
import type { WallSlotPayload } from "@/lib/art-sources/types";
import { SLOT_COUNT } from "@/lib/wall-layout";

type SlotRow = {
  source: string;
  objectId: string;
  title: string | null;
  artist: string | null;
  imageUrl: string | null;
  objectUrl: string | null;
};

type ExhibitRow = {
  id: string;
  exhibitTitle: string;
  slots: SlotRow[];
};

export type ExhibitPreviewPayload = {
  id: string;
  displayTitle: string;
  slots: WallSlotPayload[];
};

export function exhibitToPreviewPayload(
  e: ExhibitRow,
): ExhibitPreviewPayload | null {
  if (e.slots.length !== SLOT_COUNT) return null;
  return {
    id: e.id,
    displayTitle: displayExhibitTitle(e),
    slots: e.slots.map((s) => ({
      source: normalizeArtSourceId(s.source),
      objectId: s.objectId,
      title: s.title ?? "Untitled",
      artist: s.artist ?? "",
      imageUrl: s.imageUrl ?? "",
      objectUrl: s.objectUrl ?? "",
    })),
  };
}

export function mapExhibitsToPreviews(
  exhibits: ExhibitRow[],
): ExhibitPreviewPayload[] {
  return exhibits
    .map(exhibitToPreviewPayload)
    .filter((p): p is ExhibitPreviewPayload => p != null);
}
