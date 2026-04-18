import type { Metadata } from "next";
import { SITE_NAME, absoluteUrl } from "@/lib/site";

export function infoPageMetadata(opts: {
  title: string;
  description: string;
  path: string;
}): Metadata {
  const url = absoluteUrl(opts.path);
  const fullTitle = `${opts.title} · ${SITE_NAME}`;
  return {
    title: opts.title,
    description: opts.description,
    alternates: { canonical: url },
    openGraph: {
      title: fullTitle,
      description: opts.description,
      url,
      type: "website",
      siteName: SITE_NAME,
    },
    twitter: {
      card: "summary",
      title: fullTitle,
      description: opts.description,
    },
  };
}
