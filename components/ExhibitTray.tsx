"use client";

import type { WallSlotPayload } from "@/lib/art-sources/types";
import { SLOT_COUNT } from "@/lib/wall-layout";

type Props = {
  curated: WallSlotPayload[];
  onRemove: (index: number) => void;
};

export function ExhibitTray({ curated, onRemove }: Props) {
  const slots = Array.from({ length: SLOT_COUNT }, (_, i) => curated[i] ?? null);

  return (
    <div className="w-full">
      <p className="mb-2 text-center text-xs font-medium uppercase tracking-wide text-neutral-500">
        Your exhibit ({curated.length}/{SLOT_COUNT})
      </p>
      <div className="flex items-center justify-center gap-2">
        {slots.map((slot, i) => (
          <div
            key={i}
            className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md"
          >
            {slot ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element -- tiny thumbnail */}
                <img
                  src={slot.imageUrl}
                  alt=""
                  className="h-full w-full object-cover"
                  loading="lazy"
                  decoding="async"
                />
                <button
                  type="button"
                  onClick={() => onRemove(i)}
                  className="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-neutral-900/80 text-[10px] font-bold leading-none text-white shadow-sm hover:bg-neutral-900"
                  aria-label={`Remove ${slot.title}`}
                >
                  ×
                </button>
              </>
            ) : (
              <div className="flex h-full w-full items-center justify-center rounded-md border-2 border-dashed border-neutral-400/60 bg-neutral-200/30">
                <span className="text-sm text-neutral-400">{i + 1}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
