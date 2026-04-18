import type { ArtSourceId } from "./types";
import { isArtSourceId } from "./types";

export function normalizeArtSourceId(raw: string): ArtSourceId {
  return isArtSourceId(raw) ? raw : "artic";
}

/**
 * Human-readable institution name for UI (detail modal, etc.).
 * Keep in sync with `name` in `lib/museum-api-sources.ts`.
 */
export function museumDisplayName(source: ArtSourceId): string {
  switch (source) {
    case "met":
      return "The Metropolitan Museum of Art";
    case "artic":
      return "Art Institute of Chicago";
    case "cleveland":
      return "Cleveland Museum of Art";
    case "harvard":
      return "Harvard Art Museums";
    case "whitney":
      return "Whitney Museum of American Art";
    case "rijks":
      return "Rijksmuseum";
    case "ngl":
      return "National Gallery, London";
    case "getty":
      return "J. Paul Getty Museum";
    case "vam":
      return "Victoria and Albert Museum";
    case "mplus":
      return "M+ Museum";
    case "nma":
      return "National Museum of Australia";
    case "cooper":
      return "Cooper Hewitt, Smithsonian Design Museum";
  }
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
    case "whitney":
      return "View on whitney.org";
    case "rijks":
      return "View on rijksmuseum.nl";
    case "ngl":
      return "View on nationalgallery.org.uk";
    case "getty":
      return "View on getty.edu";
    case "vam":
      return "View on collections.vam.ac.uk";
    case "mplus":
      return "View on mplus.org.hk";
    case "nma":
      return "View on collectionsearch.nma.gov.au";
    case "cooper":
      return "View on collection.cooperhewitt.org";
  }
}
