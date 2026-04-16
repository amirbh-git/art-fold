import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { GalleryWall } from "@/components/GalleryWall";
import { MetAttribution } from "@/components/MetAttribution";
import { collectionLinkText, normalizeArtSourceId } from "@/lib/art-sources/copy";
import { SLOT_COUNT } from "@/lib/wall-layout";

type Props = { params: Promise<{ id: string }> };

function absoluteUrl(path: string): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  if (!base) return "";
  return `${base}${path}`;
}

function displayExhibitTitle(exhibit: { exhibitTitle: string }): string {
  const t = exhibit.exhibitTitle.trim();
  if (t) return t;
  return "Digital exhibit";
}

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
      : `An exhibit curated on Art Match.`;
  const firstImage = exhibit.slots.find((s) => s.imageUrl)?.imageUrl;
  const canonical = absoluteUrl(`/e/${id}`) || undefined;

  const ogImage = firstImage ? [{ url: firstImage, width: 1200, height: 1200 }] : [];

  return {
    title,
    description: desc,
    alternates: canonical ? { canonical } : undefined,
    openGraph: {
      title,
      description: desc,
      type: "article",
      url: canonical,
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
  const curator =
    exhibit.curatorName.trim() || "Anonymous";
  const hasDescription = exhibit.theme.trim().length > 0;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    name: exhibitTitle,
    description: hasDescription ? exhibit.theme : undefined,
    author: { "@type": "Person", name: curator },
    image: slots.filter((s) => s.imageUrl).map((s) => s.imageUrl),
  };

  return (
    <main className="mx-auto min-h-screen max-w-5xl bg-[var(--canvas)] px-4 py-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
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

      <GalleryWall slots={slots} variant="public" />

      <ul className="mx-auto mt-8 max-w-2xl space-y-3 text-sm text-neutral-700">
        {slots.map((s, i) => (
          <li key={`${s.source}:${s.objectId}:${i}`} className="flex gap-3 border-b border-neutral-400/40 pb-3">
            <div className="relative h-16 w-12 shrink-0 overflow-hidden rounded border border-neutral-400/50 bg-[var(--canvas)]">
              {s.imageUrl ? (
                <Image src={s.imageUrl} alt="" fill className="object-cover" unoptimized />
              ) : null}
            </div>
            <div className="min-w-0">
              <p className="font-medium">
                {i + 1}. {s.title}
              </p>
              {s.artist ? <p className="text-neutral-600">{s.artist}</p> : null}
              {s.objectUrl ? (
                <a
                  href={s.objectUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-neutral-500 underline underline-offset-2 hover:text-neutral-800"
                >
                  {collectionLinkText(s.source)}
                </a>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-10 space-y-6">
        <MetAttribution />
        <p className="text-center text-xs text-neutral-400">
          Created {exhibit.createdAt.toLocaleDateString(undefined, {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>
        <p className="text-center">
          <Link
            href="/"
            className="text-sm font-medium text-neutral-900 underline underline-offset-2"
          >
            Curate your own exhibit
          </Link>
        </p>
      </div>
    </main>
  );
}
