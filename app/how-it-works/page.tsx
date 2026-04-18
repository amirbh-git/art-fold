import type { Metadata } from "next";
import { JsonLd } from "@/components/JsonLd";
import { StaticInfoShell } from "@/components/StaticInfoShell";
import { infoPageMetadata } from "@/lib/info-pages";
import { breadcrumbJsonLd, webPageJsonLd } from "@/lib/schema-org";

const DESCRIPTION =
  "Browse museum works one by one, pick six, add optional details, publish, and share your exhibit link.";

export const metadata: Metadata = infoPageMetadata({
  title: "How Art Match works",
  description: DESCRIPTION,
  path: "/how-it-works",
});

export default function HowItWorksPage() {
  return (
    <>
      <JsonLd
        data={webPageJsonLd(
          "/how-it-works",
          "How Art Match works",
          DESCRIPTION,
        )}
      />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "How Art Match works", path: "/how-it-works" },
        ])}
      />
      <StaticInfoShell>
        <h1>How Art Match works</h1>
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
      </StaticInfoShell>
    </>
  );
}
