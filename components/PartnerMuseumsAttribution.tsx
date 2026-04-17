"use client";

import type { WallDensity } from "@/lib/wall-density";

type Props = {
  /** Tighter copy and type on short viewports (create flow). Public pages omit this. */
  density?: WallDensity;
};

const LINKS = (
  <>
    <a
      className="underline decoration-neutral-400 underline-offset-2 hover:text-neutral-700"
      href="https://api.artic.edu/docs/"
      target="_blank"
      rel="noreferrer"
    >
      Art Institute of Chicago
    </a>
    {" · "}
    <a
      className="underline decoration-neutral-400 underline-offset-2 hover:text-neutral-700"
      href="https://openaccess-api.clevelandart.org/"
      target="_blank"
      rel="noreferrer"
    >
      Cleveland Museum of Art
    </a>
    {" · "}
    <a
      className="underline decoration-neutral-400 underline-offset-2 hover:text-neutral-700"
      href="https://github.com/harvardartmuseums/api-docs"
      target="_blank"
      rel="noreferrer"
    >
      Harvard Art Museums
    </a>
  </>
);

export function PartnerMuseumsAttribution({ density = "normal" }: Props) {
  if (density === "ultraCompact") {
    return (
      <p className="text-center text-[10px] leading-snug text-neutral-500">
        Art and images from partner museums ({LINKS})
      </p>
    );
  }

  if (density === "compact") {
    return (
      <p className="text-center text-[10px] text-neutral-500">
        Art and images via open APIs ({LINKS})
      </p>
    );
  }

  return (
    <p className="text-center text-xs text-neutral-500">
      Art and images from partner museums via open APIs ({LINKS})
    </p>
  );
}
