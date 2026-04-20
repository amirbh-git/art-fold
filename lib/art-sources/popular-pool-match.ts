import { POPULAR_ARTIST_NAMES } from "@/lib/art-sources/popular-artists";

export function normalizeArtistMatchKey(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Longest `POPULAR_ARTIST_NAMES` entry whose normalized form appears as a substring of
 * `haystack` (after normalization). Used when ingest is not per-query (e.g. Whitney scan).
 */
export function pickMatchingPopularArtistName(haystack: string): string | null {
  const hay = normalizeArtistMatchKey(haystack);
  if (hay.length < 2) return null;
  let best: string | null = null;
  let bestLen = 0;
  for (const canon of POPULAR_ARTIST_NAMES) {
    const n = normalizeArtistMatchKey(canon);
    if (n.length < 2) continue;
    if (hay.includes(n) && n.length > bestLen) {
      bestLen = n.length;
      best = canon;
    }
  }
  return best;
}
