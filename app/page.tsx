import type { Metadata } from "next";
import { CreateWizard } from "@/components/CreateWizard";
import { HomeSiteFooter } from "@/components/HomeSiteFooter";
import { AboutContent } from "@/components/info-content/AboutContent";
import { MuseumSourcesContent } from "@/components/info-content/MuseumSourcesContent";
import { JsonLd } from "@/components/JsonLd";
import { SITE_NAME, SITE_TAGLINE, absoluteUrl } from "@/lib/site";
import { webPageJsonLd } from "@/lib/schema-org";

const HOME_TITLE =
  "Art Match — Discover museum art, browse open collections, curate your exhibit";

const ogUrl = absoluteUrl("/");

export const metadata: Metadata = {
  title: { absolute: HOME_TITLE },
  description: SITE_TAGLINE,
  alternates: { canonical: ogUrl },
  openGraph: {
    title: HOME_TITLE,
    description: SITE_TAGLINE,
    url: ogUrl,
    type: "website",
    siteName: SITE_NAME,
  },
  twitter: {
    card: "summary",
    title: HOME_TITLE,
    description: SITE_TAGLINE,
  },
};

export default function Home() {
  return (
    <>
      <JsonLd
        data={webPageJsonLd(
          "/",
          HOME_TITLE,
          SITE_TAGLINE,
        )}
      />
      <main className="min-h-dvh-safe touch-manipulation overflow-auto bg-[var(--canvas)] px-4 pb-safe pt-6">
        <header className="mx-auto mb-4 max-w-sm text-center">
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900">
            {SITE_NAME}
          </h1>
        </header>
        <CreateWizard />
        <HomeSiteFooter
          aboutModal={<AboutContent variant="modal" />}
          museumModal={<MuseumSourcesContent variant="modal" />}
        />
      </main>
    </>
  );
}
