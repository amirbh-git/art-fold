/**
 * Partner collection APIs linked from the museum sources page.
 * Keep `name` in sync with `museumDisplayName` in `lib/art-sources/copy.ts` (institution only).
 */
export type MuseumApiSource = {
  name: string;
  docsUrl: string;
};

const SOURCES: readonly MuseumApiSource[] = [
  {
    name: "Art Institute of Chicago",
    docsUrl: "https://api.artic.edu/docs/",
  },
  {
    name: "Cleveland Museum of Art",
    docsUrl: "https://openaccess-api.clevelandart.org/",
  },
  {
    name: "Cooper Hewitt, Smithsonian Design Museum",
    docsUrl: "https://apidocs.cooperhewitt.org/api-home/",
  },
  {
    name: "Harvard Art Museums",
    docsUrl: "https://github.com/harvardartmuseums/api-docs",
  },
  {
    name: "J. Paul Getty Museum",
    docsUrl: "https://data.getty.edu/museum/collection/docs/",
  },
  {
    name: "M+ Museum",
    docsUrl: "https://api.mplus.org.hk/en/documentation/about",
  },
  {
    name: "National Gallery, London",
    docsUrl:
      "https://www.nationalgallery.org.uk/documentation/ngacuk/collection-data/elasticsearch-api",
  },
  {
    name: "National Museum of Australia",
    docsUrl: "https://github.com/NationalMuseumAustralia/Collection-API/wiki",
  },
  {
    name: "Rijksmuseum",
    docsUrl: "https://data.rijksmuseum.nl/docs/search",
  },
  {
    name: "The Metropolitan Museum of Art",
    docsUrl: "https://metmuseum.github.io/",
  },
  {
    name: "Victoria and Albert Museum",
    docsUrl: "https://developers.vam.ac.uk/guide/v2/welcome.html",
  },
  {
    name: "Whitney Museum of American Art",
    docsUrl: "https://whitney.org/about/website/api",
  },
] as const;

function compareMuseumName(a: MuseumApiSource, b: MuseumApiSource): number {
  return a.name.localeCompare(b.name, "en", { sensitivity: "base" });
}

/** Alphabetical by institution name (for museum sources UI). */
export const MUSEUM_API_SOURCES_SORTED: readonly MuseumApiSource[] = [
  ...SOURCES,
].sort(compareMuseumName);
