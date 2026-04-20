import type { Metadata } from "next";
import { FaqContent } from "@/components/info-content/FaqContent";
import { JsonLd } from "@/components/JsonLd";
import { StaticInfoShell } from "@/components/StaticInfoShell";
import { infoPageMetadata } from "@/lib/info-pages";
import { breadcrumbJsonLd, webPageJsonLd } from "@/lib/schema-org";

const DESCRIPTION =
  "Accounts, editing published exhibits, where images come from, and museum affiliation—FAQ for Art Fold.";

export const metadata: Metadata = infoPageMetadata({
  title: "FAQ",
  description: DESCRIPTION,
  path: "/faq",
});

export default function FaqPage() {
  return (
    <>
      <JsonLd data={webPageJsonLd("/faq", "FAQ — Art Fold", DESCRIPTION)} />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "FAQ", path: "/faq" },
        ])}
      />
      <StaticInfoShell>
        <FaqContent variant="page" />
      </StaticInfoShell>
    </>
  );
}
