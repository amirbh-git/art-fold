import type { ArtSourceId } from "./types";
import { isArtSourceId } from "./types";

export function normalizeArtSourceId(raw: string): ArtSourceId {
  return isArtSourceId(raw) ? raw : "met";
}

/** Short link label for the museum collection page. */
export function collectionLinkText(source: ArtSourceId): string {
  switch (source) {
    case "met":
      return "View on metmuseum.org";
    case "artic":
      return "View on artic.edu";
    case "cleveland":
      return "View on clevelandart.org";
    case "harvard":
      return "View on harvardartmuseums.org";
  }
}
