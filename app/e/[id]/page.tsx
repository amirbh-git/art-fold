import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { HomeSiteFooter } from "@/components/HomeSiteFooter";
import { JsonLd } from "@/components/JsonLd";
import { AboutContent } from "@/components/info-content/AboutContent";
import { MuseumSourcesContent } from "@/components/info-content/MuseumSourcesContent";
import { PublicExhibitBody } from "@/components/PublicExhibitBody";
import { displayExhibitTitle } from "@/lib/exhibit-display";
import { prisma } from "@/lib/prisma";
import { normalizeArtSourceId } from "@/lib/art-sources/copy";
import { SITE_NAME, absoluteUrl } from "@/lib/site";
import { exhibitGraphJsonLd } from "@/lib/schema-org";
import { SLOT_COUNT } from "@/lib/wall-layout";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const exhibit = await prisma.exhibit.findUnique({
    where: { id },
    include: {
      slots: { orderBy: { position: "asc" } },
    },
  });
  if (!exhibit) return { title: "Exhibit not found" };

  const title = displayExhibitTitle(exhibit);
  const desc =
    exhibit.theme.trim().length > 0
      ? exhibit.theme.length > 160
        ? `${exhibit.theme.slice(0, 157)}…`
        : exhibit.theme
      : `An exhibit curated on ${SITE_NAME}.`;
  const firstImage = exhibit.slots.find((s) => s.imageUrl)?.imageUrl;
  const canonical = absoluteUrl(`/e/${id}`);

  const ogImage = firstImage
    ? [{ url: firstImage, width: 1200, height: 1200 }]
    : [];

  return {
    title,
    description: desc,
    alternates: { canonical },
    openGraph: {
      title,
      description: desc,
      type: "article",
      url: canonical,
      siteName: SITE_NAME,
      images: ogImage,
    },
    twitter: {
      card: firstImage ? "summary_large_image" : "summary",
      title,
      description: desc,
      images: firstImage ? [firstImage] : undefined,
    },
  };
}

export default async function ExhibitPage({ params }: Props) {
  const { id } = await params;
  const exhibit = await prisma.exhibit.findUnique({
    where: { id },
    include: {
      slots: { orderBy: { position: "asc" } },
    },
  });

  if (!exhibit || exhibit.slots.length !== SLOT_COUNT) notFound();

  const slots = exhibit.slots.map((s) => ({
    source: normalizeArtSourceId(s.source),
    objectId: s.objectId,
    title: s.title ?? "Untitled",
    artist: s.artist ?? "",
    imageUrl: s.imageUrl ?? "",
    objectUrl: s.objectUrl ?? "",
  }));

  const exhibitTitle = displayExhibitTitle(exhibit);
  const curator = exhibit.curatorName.trim() || "Anonymous";
  const hasDescription = exhibit.theme.trim().length > 0;

  const jsonLd = exhibitGraphJsonLd({
    exhibitPath: `/e/${id}`,
    exhibitTitle,
    theme: exhibit.theme,
    curatorName: curator,
    imageUrls: slots.map((s) => s.imageUrl),
  });

  return (
    <main className="mx-auto min-h-screen max-w-5xl bg-[var(--canvas)] px-4 py-10">
      <JsonLd data={jsonLd} />
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
          {exhibitTitle}
        </h1>
        {hasDescription ? (
          <p className="mx-auto mt-3 max-w-2xl whitespace-pre-wrap text-lg leading-relaxed text-neutral-800">
            {exhibit.theme}
          </p>
        ) : null}
        <p className="mt-2 text-sm text-neutral-600">by {curator}</p>
      </div>

      <PublicExhibitBody slots={slots} />

      <div className="mt-8 flex flex-col items-center gap-2 text-center">
        <Link
          href="/"
          prefetch={false}
          className="text-sm font-medium text-neutral-900 underline underline-offset-2"
        >
          Curate your own exhibit on Art Fold
        </Link>
        <Link
          href="/exhibits"
          prefetch={false}
          className="text-sm font-medium text-neutral-900 underline underline-offset-2"
        >
          Browse all Exhibits
        </Link>
      </div>

      <div className="mt-10 space-y-6 [&_footer]:mt-0">
        <HomeSiteFooter
          aboutModal={<AboutContent variant="modal" />}
          museumModal={<MuseumSourcesContent variant="modal" />}
        />
        <p className="text-center text-xs text-neutral-400">
          Created{" "}
          {exhibit.createdAt.toLocaleDateString(undefined, {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>
      </div>
    </main>
  );
}
