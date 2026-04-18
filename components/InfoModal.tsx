"use client";

import { useEffect } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** Canonical URL for crawlers; opens in a new tab so the home session stays intact. */
  fullPageHref: string;
  /** When false, hides the “Open full page” link (e.g. short help popovers). Default true. */
  showFullPageLink?: boolean;
};

export function InfoModal({
  open,
  onClose,
  title,
  children,
  fullPageHref,
  showFullPageLink = true,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-12 backdrop-blur-sm"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="relative mb-8 w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-lg font-bold text-neutral-700 shadow-sm hover:bg-white"
          aria-label="Close"
        >
          ×
        </button>
        <div className="max-h-[min(70vh,560px)] overflow-y-auto pr-1 pt-1">
          {children}
        </div>
        {showFullPageLink ? (
          <p className="mt-4 border-t border-neutral-200 pt-3 text-center text-xs text-neutral-500">
            <a
              href={fullPageHref}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-neutral-700 underline underline-offset-2 hover:text-neutral-900"
            >
              Open full page
            </a>{" "}
            <span className="text-neutral-400">(new tab)</span>
          </p>
        ) : null}
      </div>
    </div>
  );
}
