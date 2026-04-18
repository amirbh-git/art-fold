"use client";

import Link from "next/link";
import { GalleryWall } from "@/components/GalleryWall";
import type { ExhibitPreviewPayload } from "@/lib/exhibit-preview-payload";

type Props = {
  exhibits: ExhibitPreviewPayload[];
};

export function ExhibitsBrowseGrid({ exhibits }: Props) {
  if (exhibits.length === 0) {
    return (
      <p className="text-center text-sm text-neutral-600">
        No exhibits yet.
      </p>
    );
  }

  return (
    <ul className="mx-auto grid w-full max-w-2xl grid-cols-3 gap-3">
      {exhibits.map((ex) => (
        <li key={ex.id} className="min-w-0">
          <Link
            href={`/e/${ex.id}`}
            className="flex h-full flex-col items-stretch rounded-lg border border-neutral-300/70 bg-white/60 p-2 text-center shadow-sm transition-colors hover:border-neutral-400 hover:bg-white"
          >
            <span className="mb-1.5 line-clamp-3 text-[11px] font-semibold leading-snug text-neutral-900">
              {ex.displayTitle}
            </span>
            <div className="mt-auto flex w-full justify-center [zoom:0.55]">
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
  );
}
