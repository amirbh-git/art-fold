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
      href="https://metmuseum.github.io/"
      target="_blank"
      rel="noreferrer"
    >
      Met
    </a>
    ,{" "}
    <a
      className="underline decoration-neutral-400 underline-offset-2 hover:text-neutral-700"
      href="https://api.artic.edu/docs/"
      target="_blank"
      rel="noreferrer"
    >
      Art Institute of Chicago
    </a>
    ,{" "}
    <a
      className="underline decoration-neutral-400 underline-offset-2 hover:text-neutral-700"
      href="https://openaccess-api.clevelandart.org/"
      target="_blank"
      rel="noreferrer"
    >
      Cleveland Museum of Art
    </a>
    , and optionally{" "}
    <a
      className="underline decoration-neutral-400 underline-offset-2 hover:text-neutral-700"
      href="https://github.com/harvardartmuseums/api-docs"
      target="_blank"
      rel="noreferrer"
    >
      Harvard Art Museums
    </a>
    .
  </>
);

export function MetAttribution({ density = "normal" }: Props) {
  if (density === "ultraCompact") {
    return (
      <p className="text-center text-[10px] leading-snug text-neutral-500">
        Collection data and images from partner museums ({LINKS})
      </p>
    );
  }

  if (density === "compact") {
    return (
      <p className="text-center text-[10px] text-neutral-500">
        Artwork data and images from The Met, Art Institute of Chicago, Cleveland Museum of Art, and
        optionally Harvard Art Museums ({LINKS})
      </p>
    );
  }

  return (
    <p className="text-center text-xs text-neutral-500">
      Artwork data and images are provided by The Metropolitan Museum of Art, the Art Institute of
      Chicago, the Cleveland Museum of Art, and (when an API key is configured) Harvard Art Museums,
      via their public APIs ({LINKS})
    </p>
  );
}
