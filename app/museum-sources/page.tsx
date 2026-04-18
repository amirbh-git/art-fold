import type { Metadata } from "next";
import { JsonLd } from "@/components/JsonLd";
import { MuseumSourcesContent } from "@/components/info-content/MuseumSourcesContent";
import { StaticInfoShell } from "@/components/StaticInfoShell";
import { infoPageMetadata } from "@/lib/info-pages";
import { breadcrumbJsonLd, webPageJsonLd } from "@/lib/schema-org";

const DESCRIPTION =
  "Artworks shown in Art Match come from partner museums’ open APIs: Art Institute of Chicago, Cleveland Museum of Art, Harvard Art Museums, and The Met.";

export const metadata: Metadata = infoPageMetadata({
  title: "Museum sources",
  description: DESCRIPTION,
  path: "/museum-sources",
});

export default function MuseumSourcesPage() {
  return (
    <>
      <JsonLd
        data={webPageJsonLd(
          "/museum-sources",
          "Museum sources",
          DESCRIPTION,
        )}
      />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Museum sources", path: "/museum-sources" },
        ])}
      />
      <StaticInfoShell>
        <MuseumSourcesContent variant="page" />
      </StaticInfoShell>
    </>
  );
}
