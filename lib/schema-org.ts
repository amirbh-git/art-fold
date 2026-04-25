import { SITE_NAME, absoluteUrl, siteOrigin } from "@/lib/site";

const BRAND_SAME_AS = [
  "https://github.com/amirbh-git/art-fold",
  "https://www.amirbh.com/",
] as const;

function ids() {
  const base = siteOrigin();
  return {
    orgId: `${base}/#organization`,
    websiteId: `${base}/#website`,
  };
}

function organizationNode() {
  const { orgId } = ids();
  return {
    "@type": "Organization",
    "@id": orgId,
    name: SITE_NAME,
    url: siteOrigin(),
    sameAs: BRAND_SAME_AS,
    description:
      "Interactive tool to browse open-access museum collections and publish a personal six-work digital exhibition.",
  };
}

function websiteNode() {
  const { orgId, websiteId } = ids();
  return {
    "@type": "WebSite",
    "@id": websiteId,
    name: SITE_NAME,
    url: siteOrigin(),
    description:
      "Discover public-domain museum art, browse open-access museum APIs, and curate a shareable six-work exhibit.",
    publisher: { "@id": orgId },
    potentialAction: {
      "@type": "SearchAction",
      target: `${absoluteUrl("/exhibits")}?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}

export function siteGraphJsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [organizationNode(), websiteNode()],
  };
}

export function webPageJsonLd(path: string, name: string, description: string) {
  const { orgId, websiteId } = ids();
  const url = absoluteUrl(path);
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": `${url}#webpage`,
    url,
    name,
    description,
    isPartOf: { "@id": websiteId },
    about: { "@id": orgId },
  };
}

export function breadcrumbJsonLd(
  items: { name: string; path: string }[],
) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export function exhibitGraphJsonLd(input: {
  exhibitPath: string;
  exhibitTitle: string;
  theme: string;
  curatorName: string;
  imageUrls: string[];
}) {
  const { websiteId, orgId } = ids();
  const url = absoluteUrl(input.exhibitPath);
  const hasDescription = input.theme.trim().length > 0;

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${url}#webpage`,
        url,
        name: input.exhibitTitle,
        description: hasDescription
          ? input.theme.length > 300
            ? `${input.theme.slice(0, 297)}…`
            : input.theme
          : `A six-work digital exhibit curated on ${SITE_NAME}.`,
        isPartOf: { "@id": websiteId },
        about: { "@id": orgId },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Home",
            item: siteOrigin(),
          },
          {
            "@type": "ListItem",
            position: 2,
            name: input.exhibitTitle,
            item: url,
          },
        ],
      },
      {
        "@type": "CreativeWork",
        name: input.exhibitTitle,
        description: hasDescription ? input.theme : undefined,
        author: { "@type": "Person", name: input.curatorName },
        image: input.imageUrls.filter(Boolean),
        url,
      },
    ],
  };
}
