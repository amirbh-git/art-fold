import { INFO_ARTICLE_CLASS } from "@/components/info-content/prose";

type Variant = "page" | "modal";

export function AboutContent({ variant }: { variant: Variant }) {
  const inner = (
    <>
      {variant === "page" ? (
        <h1>About</h1>
      ) : (
        <h2 className="text-2xl font-semibold tracking-tight text-neutral-900 normal-case">
          About
        </h2>
      )}
      <p>
        Art Match is a small experiment in digital curation. It lets anyone browse
        works from partner museum collections, select six that resonate and fit
        any theme, and turn them into an exhibit that can be easily shared with
        anyone.
      </p>
    </>
  );

  if (variant === "modal") {
    return <div className={INFO_ARTICLE_CLASS}>{inner}</div>;
  }
  return inner;
}
