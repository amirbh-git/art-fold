import type { Metadata } from "next";
import { CreateWizard } from "@/components/CreateWizard";
import { HomeSiteFooter } from "@/components/HomeSiteFooter";
import { AboutContent } from "@/components/info-content/AboutContent";
import { MuseumSourcesContent } from "@/components/info-content/MuseumSourcesContent";
import { JsonLd } from "@/components/JsonLd";
import { mapExhibitsToPreviews } from "@/lib/exhibit-preview-payload";
import { prisma } from "@/lib/prisma";
import { SITE_NAME, SITE_TAGLINE, absoluteUrl } from "@/lib/site";
import { webPageJsonLd } from "@/lib/schema-org";

const HOME_TITLE =
  "Art Fold — Discover museum art, browse open collections, curate your exhibit";

const ogUrl = absoluteUrl("/");

/** Recent exhibits are loaded from the DB; avoid caching a stale list at build time. */
export const dynamic = "force-dynamic";

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

export default async function Home() {
  const recentRaw = await prisma.exhibit.findMany({
    where: { featureOnHomepage: true },
    orderBy: { createdAt: "desc" },
    take: 3,
    include: { slots: { orderBy: { position: "asc" } } },
  });

  const recentExhibits = mapExhibitsToPreviews(
    recentRaw.map((e) => ({
      id: e.id,
      exhibitTitle: e.exhibitTitle,
      slots: e.slots,
    })),
  );

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
          <p className="mt-1 text-sm text-neutral-500">
            Curate your own art exhibit
          </p>
        </header>
        <CreateWizard recentExhibits={recentExhibits} />
        <HomeSiteFooter
          aboutModal={<AboutContent variant="modal" />}
          museumModal={<MuseumSourcesContent variant="modal" />}
        />
      </main>
    </>
  );
}
