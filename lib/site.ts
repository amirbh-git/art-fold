/** Canonical public host when env is unset (OG URLs, robots sitemap hint). */
export const DEFAULT_SITE_ORIGIN = "https://www.artfold.xyz";

export const SITE_NAME = "Art Fold";

export const SITE_TAGLINE =
  "Discover public-domain museum art, browse open-access collections, and curate your own six-work digital exhibition.";

export function siteOrigin(): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return DEFAULT_SITE_ORIGIN;
}

export function absoluteUrl(path: string): string {
  const base = siteOrigin();
  if (!path.startsWith("/")) return `${base}/${path}`;
  return `${base}${path}`;
}
