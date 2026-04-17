"use client";

import { useEffect, useState } from "react";

export function ExhibitHowItWorksHint() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <div className="mx-auto mt-4 flex max-w-2xl justify-center">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-neutral-400/70 bg-white text-sm font-semibold text-neutral-600 shadow-sm hover:border-neutral-600 hover:text-neutral-900"
          aria-label="How Art Match works"
          title="How does this work?"
        >
          ?
        </button>
      </div>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-16 backdrop-blur-sm"
          role="presentation"
          onClick={() => setOpen(false)}
        >
          <div
            className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
            role="dialog"
            aria-label="How Art Match works"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-lg font-bold text-neutral-700 shadow-sm hover:bg-white"
              aria-label="Close"
            >
              ×
            </button>
            <h2 className="pr-8 text-lg font-semibold text-neutral-900">
              How Art Match works
            </h2>
            <ul className="mt-4 list-inside list-disc space-y-2 text-sm leading-relaxed text-neutral-800">
              <li>
                Open <strong>Art Match</strong> and swipe through artworks—pass
                or save each one until you&apos;ve chosen six for your wall.
              </li>
              <li>
                Add an optional <strong>exhibit name</strong>,{" "}
                <strong>description</strong>, and <strong>your name</strong>,
                then publish.
              </li>
              <li>
                Share your personal link so friends can view your mini exhibit
                online.
              </li>
            </ul>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-6 w-full rounded-lg bg-neutral-900 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800"
            >
              Got it
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
