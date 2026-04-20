"use client";

import { useRef } from "react";
import { SITE_NAME } from "@/lib/site";

type Props = {
  url: string;
  exhibitTitle: string;
  /** Extra line for share text (e.g. description snippet). */
  blurb?: string;
};

export function ShareRow({ url, exhibitTitle, blurb }: Props) {
  const text =
    blurb?.trim() ||
    `See my exhibit on ${SITE_NAME}: ${exhibitTitle.trim() || SITE_NAME}`;

  const canNativeShare =
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function";

  const sharingRef = useRef(false);

  const shareNative = async () => {
    if (!canNativeShare || sharingRef.current) return;
    sharingRef.current = true;
    try {
      await navigator.share({
        title: exhibitTitle.trim() || SITE_NAME,
        text,
        url,
      });
    } catch (e) {
      const err = e as Error;
      if (err.name === "AbortError") return;
      if (err.name === "InvalidStateError") return;
      console.error(e);
    } finally {
      sharingRef.current = false;
    }
  };

  if (!canNativeShare) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <button
        type="button"
        onClick={() => void shareNative()}
        className="rounded-lg border border-neutral-400/70 bg-white px-4 py-2 text-sm font-medium text-neutral-800 shadow-sm hover:bg-neutral-50"
      >
        Share…
      </button>
    </div>
  );
}
