/**
 * Post-filter for cross-museum `popular` pool ingest: search APIs match titles and
 * unrelated fields, so we require the canonical list name to align with credited artist text.
 */

function normalizeForArtistMatch(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[\u2018\u2019`´]/g, "'")
    .toLowerCase()
    .trim();
}

const ARTIST_NAME_PARTICLE_TOKENS = new Set([
  "the",
  "a",
  "an",
  "of",
  "and",
  "or",
  "de",
  "la",
  "le",
  "el",
  "los",
  "las",
  "van",
  "von",
  "del",
  "della",
  "y",
  "da",
  "di",
  "du",
  "al",
  "il",
  "lo",
  "un",
  "una",
]);

/**
 * True if `artistHaystack` (artist line, maker summary, Getty label, etc.) plausibly credits
 * `canonicalArtistName`. When haystack contains a newline, only the first line is used
 * (e.g. AIC `artist_display` before nationality).
 */
export function popularPoolSearchHitMatchesArtist(
  canonicalArtistName: string,
  artistHaystack: string | null | undefined,
): boolean {
  const raw = (artistHaystack ?? "").trim();
  if (!raw) return false;
  const head = raw.includes("\n")
    ? (raw.split(/\n/)[0] ?? "").trim()
    : raw;
  if (!head) return false;

  const nCanon = normalizeForArtistMatch(canonicalArtistName);
  const nHay = normalizeForArtistMatch(head);
  if (!nCanon || !nHay) return false;

  if (nHay.includes(nCanon)) return true;

  const tokens = nCanon
    .split(/[^0-9\p{L}']+/u)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  const required = tokens.filter(
    (t) =>
      t.length >= 4 ||
      (t.length === 3 && !ARTIST_NAME_PARTICLE_TOKENS.has(t)) ||
      (t.length === 2 && !ARTIST_NAME_PARTICLE_TOKENS.has(t)),
  );

  if (required.length === 0) {
    return tokens.length > 0 && tokens.every((t) => nHay.includes(t));
  }

  return required.every((t) => nHay.includes(t));
}
