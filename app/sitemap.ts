import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { SLOT_COUNT } from "@/lib/wall-layout";
import { DEFAULT_SITE_ORIGIN, siteOrigin } from "@/lib/site";

const STATIC_PATHS = [
  "",
  "/about",
  "/how-it-works",
  "/museum-sources",
  "/faq",
  "/exhibits",
] as const;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteOrigin() || DEFAULT_SITE_ORIGIN;
  const lastModified = new Date();

  const staticEntries: MetadataRoute.Sitemap = STATIC_PATHS.map((path) => ({
    url: `${base}${path === "" ? "" : path}`,
    lastModified,
    changeFrequency: path === "" ? "weekly" : "monthly",
    priority: path === "" ? 1 : 0.7,
  }));

  const exhibits = await prisma.exhibit.findMany({
    where: {
      featureOnHomepage: true,
      slots: { some: { position: SLOT_COUNT } },
    },
    select: {
      id: true,
      createdAt: true,
    },
  });

  const exhibitEntries: MetadataRoute.Sitemap = exhibits.map((e) => ({
    url: `${base}/e/${e.id}`,
    lastModified: e.createdAt,
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  return [...staticEntries, ...exhibitEntries];
}
