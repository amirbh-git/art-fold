import { SITE_NAME } from "@/lib/site";

export function displayExhibitTitle(exhibit: { exhibitTitle: string }): string {
  const t = exhibit.exhibitTitle.trim();
  if (t) return t;
  return SITE_NAME;
}
