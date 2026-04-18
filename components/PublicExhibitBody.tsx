"use client";

import Image from "next/image";
import { useState } from "react";
import { ArtDetailModal } from "@/components/ArtDetailModal";
import { GalleryWall } from "@/components/GalleryWall";
import { collectionLinkText } from "@/lib/art-sources/copy";
import type { WallSlotPayload } from "@/lib/art-sources/types";

type Props = {
  slots: WallSlotPayload[];
};

export function PublicExhibitBody({ slots }: Props) {
  const [detailCard, setDetailCard] = useState<WallSlotPayload | null>(null);

  return (
    <>
      <GalleryWall
        slots={slots}
        variant="public"
        onTileClick={(slot) => setDetailCard(slot)}
      />

      <ul className="mx-auto mt-8 max-w-2xl space-y-3 text-sm text-neutral-700">
        {slots.map((s, i) => (
          <li
            key={`${s.source}:${s.objectId}:${i}`}
            className="flex gap-3 border-b border-neutral-400/40 pb-3"
          >
            <button
              type="button"
              className="relative flex h-16 w-12 shrink-0 flex-col overflow-hidden rounded border-2 border-neutral-600/75 bg-[var(--canvas)] p-0 leading-none focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500 focus-visible:ring-offset-1"
              onClick={() => setDetailCard(s)}
              aria-label={`View details: ${s.title}`}
            >
              {s.imageUrl ? (
                <Image
                  src={s.imageUrl}
                  alt=""
                  fill
                  className="object-cover"
                  unoptimized
                />
              ) : null}
            </button>
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

      {detailCard ? (
        <ArtDetailModal
          card={detailCard}
          onClose={() => setDetailCard(null)}
        />
      ) : null}
    </>
  );
}
