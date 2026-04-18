import type { Metadata } from "next";
import { JsonLd } from "@/components/JsonLd";
import { MuseumSourcesContent } from "@/components/info-content/MuseumSourcesContent";
import { StaticInfoShell } from "@/components/StaticInfoShell";
import { infoPageMetadata } from "@/lib/info-pages";
import { breadcrumbJsonLd, webPageJsonLd } from "@/lib/schema-org";

const DESCRIPTION =
  "Artworks in Art Match come from twelve partner museums via their public collection APIs, listed A–Z with links to each source’s developer documentation.";

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
