import type { Metadata } from "next";
import Link from "next/link";
import { ExhibitsBrowseGrid } from "@/components/ExhibitsBrowseGrid";
import { HomeSiteFooter } from "@/components/HomeSiteFooter";
import { AboutContent } from "@/components/info-content/AboutContent";
import { MuseumSourcesContent } from "@/components/info-content/MuseumSourcesContent";
import { mapExhibitsToPreviews } from "@/lib/exhibit-preview-payload";
import { prisma } from "@/lib/prisma";
import { SITE_NAME, absoluteUrl } from "@/lib/site";
import { SLOT_COUNT } from "@/lib/wall-layout";

const PAGE_TITLE = `All exhibits — ${SITE_NAME}`;
const PAGE_DESC = "Browse curated exhibits listed on Art Fold.";

const canonical = absoluteUrl("/exhibits");

const PER_PAGE = 12;

/** Full wall and opted in to site listings (home + All exhibits); URL-only if unchecked at publish. */
const whereListed = {
  featureOnHomepage: true,
  slots: {
    some: { position: SLOT_COUNT },
  },
} as const;

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESC,
  alternates: { canonical },
  openGraph: {
    title: PAGE_TITLE,
    description: PAGE_DESC,
    url: canonical,
    type: "website",
    siteName: SITE_NAME,
  },
};

type Props = { searchParams: Promise<{ page?: string }> };

export default async function ExhibitsIndexPage({ searchParams }: Props) {
  const sp = await searchParams;
  const parsed = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);

  const total = await prisma.exhibit.count({ where: whereListed });
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const page = Math.min(parsed, totalPages);
  const skip = (page - 1) * PER_PAGE;

  const rows = await prisma.exhibit.findMany({
    where: whereListed,
    orderBy: { createdAt: "desc" },
    skip,
    take: PER_PAGE,
    include: { slots: { orderBy: { position: "asc" } } },
  });

  const exhibits = mapExhibitsToPreviews(
    rows.map((e) => ({
      id: e.id,
      exhibitTitle: e.exhibitTitle,
      slots: e.slots,
    })),
  );

  const from = total === 0 ? 0 : skip + 1;
  const to = skip + exhibits.length;

  return (
    <main className="mx-auto min-h-dvh-safe max-w-2xl touch-manipulation bg-[var(--canvas)] px-4 pb-safe pt-6">
      <header className="mb-6 text-center">
        <p className="mb-3">
          <Link
            href="/"
            prefetch={false}
            className="text-sm font-medium text-neutral-900 underline underline-offset-2"
          >
            ← {SITE_NAME}
          </Link>
        </p>
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
          All exhibits
        </h1>
        <p className="mt-2 text-sm text-neutral-600">
          {total} {total === 1 ? "exhibit" : "exhibits"}
          {total > 0 ? (
            <>
              {" "}
              ({from}–{to})
            </>
          ) : null}
        </p>
      </header>

      <ExhibitsBrowseGrid exhibits={exhibits} />

      {totalPages > 1 ? (
        <nav
          className="mt-8 flex flex-wrap items-center justify-center gap-4 text-sm text-neutral-700"
          aria-label="Exhibit list pagination"
        >
          {page > 1 ? (
            <Link
              href={page === 2 ? "/exhibits" : `/exhibits?page=${page - 1}`}
              prefetch={false}
              className="font-medium text-neutral-900 underline underline-offset-2"
            >
              Previous
            </Link>
          ) : (
            <span className="text-neutral-400">Previous</span>
          )}
          <span className="text-neutral-600">
            Page {page} of {totalPages}
          </span>
          {page < totalPages ? (
            <Link
              href={`/exhibits?page=${page + 1}`}
              prefetch={false}
              className="font-medium text-neutral-900 underline underline-offset-2"
            >
              Next
            </Link>
          ) : (
            <span className="text-neutral-400">Next</span>
          )}
        </nav>
      ) : null}

      <div className="mt-10">
        <HomeSiteFooter
          aboutModal={<AboutContent variant="modal" />}
          museumModal={<MuseumSourcesContent variant="modal" />}
        />
      </div>
    </main>
  );
}
