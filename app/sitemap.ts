import type { MetadataRoute } from "next";
import { DEFAULT_SITE_ORIGIN, siteOrigin } from "@/lib/site";

/**
 * Revalidate every hour so Vercel caches this as ISR rather than
 * invoking the serverless function on every request. Prevents 500s
 * from DB cold-start / connection-pool timeouts that cause Google
 * Search Console "couldn't fetch" errors.
 */
export const revalidate = 3600;

const STATIC_PATHS = [
  "",
  "/about",
  "/how-it-works",
  "/museum-sources",
  "/faq",
  "/exhibits",
] as const;

const DB_TIMEOUT_MS = 4_000;

async function fetchExhibitEntries(
  base: string,
): Promise<MetadataRoute.Sitemap> {
  // Lazy-import Prisma so a DB connection failure can never crash the
  // module-level evaluation and take down the entire sitemap response.
  const { prisma } = await import("@/lib/prisma");
  const { SLOT_COUNT } = await import("@/lib/wall-layout");

  const exhibits = await prisma.exhibit.findMany({
    where: {
      featureOnHomepage: true,
      slots: { every: { position: { lte: SLOT_COUNT } } },
    },
    select: { id: true, createdAt: true, _count: { select: { slots: true } } },
  });

  return exhibits
    .filter((e) => e._count.slots === SLOT_COUNT)
    .map((e) => ({
      url: `${base}/e/${e.id}`,
      lastModified: e.createdAt,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    }));
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteOrigin() || DEFAULT_SITE_ORIGIN;
  const lastModified = new Date();

  const staticEntries: MetadataRoute.Sitemap = STATIC_PATHS.map((path) => ({
    url: `${base}${path === "" ? "" : path}`,
    lastModified,
    changeFrequency: path === "" ? "weekly" : "monthly",
    priority: path === "" ? 1 : 0.7,
  }));

  let exhibitEntries: MetadataRoute.Sitemap = [];
  try {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("sitemap db timeout")), DB_TIMEOUT_MS),
    );
    exhibitEntries = await Promise.race([
      fetchExhibitEntries(base),
      timeout,
    ]);
  } catch {
    // Static entries still returned when DB is unreachable or slow.
  }

  return [...staticEntries, ...exhibitEntries];
}
