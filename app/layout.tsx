import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { JsonLd } from "@/components/JsonLd";
import {
  DEFAULT_SITE_ORIGIN,
  SITE_NAME,
  SITE_TAGLINE,
  siteOrigin,
} from "@/lib/site";
import { siteGraphJsonLd } from "@/lib/schema-org";
import "./globals.css";

const base = siteOrigin() || DEFAULT_SITE_ORIGIN;

export const metadata: Metadata = {
  metadataBase: new URL(base),
  title: {
    default: `${SITE_NAME} — Museum art curation`,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_TAGLINE,
  applicationName: SITE_NAME,
  openGraph: {
    type: "website",
    locale: "en",
    siteName: SITE_NAME,
    url: base,
    title: `${SITE_NAME} — Museum art curation`,
    description: SITE_TAGLINE,
  },
  twitter: {
    card: "summary",
    title: `${SITE_NAME} — Museum art curation`,
    description: SITE_TAGLINE,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[var(--canvas)] antialiased">
        <JsonLd data={siteGraphJsonLd()} />
        {children}
        <Analytics />
      </body>
    </html>
  );
}
