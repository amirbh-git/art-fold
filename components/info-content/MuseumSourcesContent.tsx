import { INFO_ARTICLE_CLASS } from "@/components/info-content/prose";
import { MUSEUM_API_SOURCES_SORTED } from "@/lib/museum-api-sources";

type Variant = "page" | "modal";

export function MuseumSourcesContent({ variant }: { variant: Variant }) {
  const title =
    variant === "page" ? (
      <h1>Museum sources</h1>
    ) : (
      <h2 className="text-2xl font-semibold tracking-tight text-neutral-900 normal-case">
        Museum sources
      </h2>
    );
  const apisHeading = variant === "page" ? <h2>APIs</h2> : <h3>APIs</h3>;

  const inner = (
    <>
      {title}
      <p>
        Images and object metadata are served by the museums (or their CDNs)
        under their own terms. Art Fold only aggregates what those APIs expose
        for open access or public-domain works, depending on each collection.
      </p>
      {apisHeading}
      <ul>
        {MUSEUM_API_SOURCES_SORTED.map(({ name, docsUrl }) => (
          <li key={docsUrl}>
            <a href={docsUrl} target="_blank" rel="noreferrer">
              {name}
            </a>
          </li>
        ))}
      </ul>
      <p className="text-sm text-neutral-600">
        Always follow each museum’s reuse and citation guidance when sharing or
        reusing images off-platform.
      </p>
    </>
  );

  if (variant === "modal") {
    return <div className={INFO_ARTICLE_CLASS}>{inner}</div>;
  }
  return inner;
}
