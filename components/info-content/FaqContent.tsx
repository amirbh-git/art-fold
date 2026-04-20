"use client";

import Link from "next/link";
import { INFO_ARTICLE_CLASS } from "@/components/info-content/prose";

type Variant = "page" | "modal";

type Props = {
  variant: Variant;
  /** When set (modal flow), switches FAQ modal to museum sources instead of navigating. */
  onMuseumSourcesClick?: () => void;
};

export function FaqContent({ variant, onMuseumSourcesClick }: Props) {
  const title =
    variant === "page" ? (
      <h1>FAQ</h1>
    ) : (
      <h2 className="text-2xl font-semibold tracking-tight text-neutral-900 normal-case">
        FAQ
      </h2>
    );

  const q = (children: React.ReactNode) =>
    variant === "page" ? <h2>{children}</h2> : <h3>{children}</h3>;

  const museumSourcesInline =
    onMuseumSourcesClick != null ? (
      <button
        type="button"
        onClick={onMuseumSourcesClick}
        className="font-medium text-neutral-900 underline decoration-neutral-400 underline-offset-2 hover:text-neutral-950"
      >
        Museum sources
      </button>
    ) : (
      <Link
        href="/museum-sources"
        prefetch={false}
        className="font-medium text-neutral-900 underline decoration-neutral-400 underline-offset-2 hover:text-neutral-950"
      >
        Museum sources
      </Link>
    );

  const inner = (
    <>
      {title}
      {q("Do I need an account?")}
      <p>
        No. You build an exhibit in the browser, publish it, and share the link.
        Visitors do not need to log in.
      </p>
      {q("Can I edit after publishing?")}
      <p>
        Not at the moment. Each published exhibit is a snapshot. To make changes,
        start a new exhibit from the home page.
      </p>
      {q("Where do the images come from?")}
      <p>
        From partner museums’ open APIs. See {museumSourcesInline} for links and
        documentation.
      </p>
      {q("Is this affiliated with the museums?")}
      <p>
        Art Fold is an independent project that uses their public APIs. It is not
        endorsed by the museums.
      </p>
    </>
  );

  if (variant === "modal") {
    return (
      <div
        className={`${INFO_ARTICLE_CLASS} [&_h3+p]:!mt-1.5`}
      >
        {inner}
      </div>
    );
  }
  return inner;
}
