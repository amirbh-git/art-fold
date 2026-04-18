import type { MetadataRoute } from "next";
import { DEFAULT_SITE_ORIGIN, siteOrigin } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  const sitemapBase = siteOrigin() || DEFAULT_SITE_ORIGIN;
  const sitemap = `${sitemapBase.replace(/\/$/, "")}/sitemap.xml`;

  return {
    rules: [
      {
        userAgent: "GPTBot",
        disallow: "/",
      },
      {
        userAgent: "OAI-SearchBot",
        allow: "/",
      },
      {
        userAgent: "*",
        allow: "/",
      },
    ],
    sitemap,
    host: new URL(sitemapBase).host,
  };
}
