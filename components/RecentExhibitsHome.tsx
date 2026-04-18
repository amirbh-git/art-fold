"use client";

import Link from "next/link";
import { GalleryWall } from "@/components/GalleryWall";
import type { ExhibitPreviewPayload } from "@/lib/exhibit-preview-payload";

export type RecentExhibitPreview = ExhibitPreviewPayload;

type Props = {
  exhibits: ExhibitPreviewPayload[];
};

export function RecentExhibitsHome({ exhibits }: Props) {
  if (exhibits.length === 0) return null;

  return (
    <section
      className="w-full space-y-1.5"
      aria-labelledby="recent-exhibits-heading"
    >
      <h2
        id="recent-exhibits-heading"
        className="mb-2 text-center text-xs font-medium uppercase tracking-wide text-neutral-500"
      >
        Recent exhibits
      </h2>
      <ul className="flex w-full flex-row items-start justify-center gap-1.5">
        {exhibits.map((ex) => (
          <li key={ex.id} className="min-w-0 flex-1 basis-0">
            <Link
              href={`/e/${ex.id}`}
              className="flex flex-col items-stretch rounded-md border border-neutral-300/70 bg-white/50 p-1 shadow-sm transition-colors hover:border-neutral-400 hover:bg-white/80"
            >
              <p className="mb-0.5 line-clamp-2 min-h-[1.75rem] text-center text-[9px] font-semibold leading-snug text-neutral-900">
                {ex.displayTitle}
              </p>
              <div className="flex w-full justify-center overflow-visible [zoom:0.42]">
                <GalleryWall
                  slots={ex.slots}
                  interactive={false}
                  showLockChrome={false}
                  variant="theme"
                  density="ultraCompact"
                />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
