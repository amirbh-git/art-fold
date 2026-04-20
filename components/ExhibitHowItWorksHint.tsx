"use client";

import { useState } from "react";
import { InfoModal } from "@/components/InfoModal";
import { INFO_ARTICLE_CLASS } from "@/components/info-content/prose";

export function ExhibitHowItWorksHint() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="mx-auto flex max-w-2xl justify-center">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-neutral-400/70 bg-white text-sm font-semibold text-neutral-600 shadow-sm hover:border-neutral-600 hover:text-neutral-900"
          aria-label="How Art Fold works"
          title="How does this work?"
        >
          ?
        </button>
      </div>

      <InfoModal
        open={open}
        onClose={() => setOpen(false)}
        title="How Art Fold works"
        fullPageHref="/how-it-works"
      >
        <div className={INFO_ARTICLE_CLASS}>
          <h2 className="text-2xl font-semibold tracking-tight text-neutral-900 normal-case">
            How Art Fold works
          </h2>
          <ol className="list-inside list-decimal space-y-3">
            <li>
              Browse artworks one by one, passing or saving each piece until
              you&apos;ve chosen six for your exhibit.
            </li>
            <li>
              Add an optional title, description, and your name, then publish.
            </li>
            <li>
              Share the link so others can view it online.
            </li>
          </ol>
        </div>
      </InfoModal>
    </>
  );
}
