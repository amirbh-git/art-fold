"use client";

import { useEffect } from "react";
import { collectionLinkText } from "@/lib/art-sources/copy";
import type { WallSlotPayload } from "@/lib/art-sources/types";

type Props = {
  card: WallSlotPayload;
  onClose: () => void;
};

function DetailRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="border-b border-neutral-200/80 py-2.5">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-neutral-800">{value}</dd>
    </div>
  );
}

export function ArtDetailModal({ card, onClose }: Props) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-12 backdrop-blur-sm">
      <div
        className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
        role="dialog"
        aria-label={`Details: ${card.title}`}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-lg font-bold text-neutral-700 shadow-sm hover:bg-white"
          aria-label="Close"
        >
          ×
        </button>

        {/* eslint-disable-next-line @next/next/no-img-element -- detail view */}
        <img
          src={card.imageUrl}
          alt={card.title}
          className="block w-full"
          loading="eager"
          decoding="async"
        />

        <div className="px-5 py-4">
          <h2 className="text-lg font-semibold leading-snug text-neutral-900">
            {card.title}
            {card.objectDate && (
              <span className="font-normal text-neutral-500">
                , {card.objectDate}
              </span>
            )}
          </h2>

          <dl className="mt-3">
            <DetailRow label="Artist" value={card.artist} />
            <DetailRow label="Bio" value={card.artistBio} />
            <DetailRow label="Medium" value={card.medium} />
            <DetailRow label="Dimensions" value={card.dimensions} />
            <DetailRow label="Department" value={card.department} />
            <DetailRow label="Credit" value={card.creditLine} />
          </dl>

          {card.objectUrl && (
            <a
              href={card.objectUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-block text-sm font-medium text-neutral-700 underline underline-offset-2 hover:text-neutral-900"
            >
              {collectionLinkText(card.source)}
            </a>
          )}
        </div>
      </div>

      {/* Backdrop click to close */}
      <div
        className="fixed inset-0 -z-10"
        onClick={onClose}
        aria-hidden="true"
      />
    </div>
  );
}
