import type { Metadata } from "next";
import { AboutContent } from "@/components/info-content/AboutContent";
import { JsonLd } from "@/components/JsonLd";
import { StaticInfoShell } from "@/components/StaticInfoShell";
import { infoPageMetadata } from "@/lib/info-pages";
import { breadcrumbJsonLd, webPageJsonLd } from "@/lib/schema-org";

const DESCRIPTION =
  "Art Match is a small experiment in digital curation: browse partner museum works, pick six that resonate with any theme, and share your exhibit.";

export const metadata: Metadata = infoPageMetadata({
  title: "About",
  description: DESCRIPTION,
  path: "/about",
});

export default function AboutPage() {
  return (
    <>
      <JsonLd
        data={webPageJsonLd("/about", "About Art Match", DESCRIPTION)}
      />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "About", path: "/about" },
        ])}
      />
      <StaticInfoShell>
        <AboutContent variant="page" />
      </StaticInfoShell>
    </>
  );
}
