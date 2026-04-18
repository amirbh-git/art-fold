import { NextResponse } from "next/server";
import { getRandomArtSlots } from "@/lib/art-sources/random-art";
import { SLOT_COUNT } from "@/lib/wall-layout";

export const dynamic = "force-dynamic";

type Body = {
  excludeObjectIds?: string[];
  count?: number;
};

/** Accepts composite keys (`met:123`) or legacy bare Met object IDs (`123`). */
function normalizeExcludeIds(raw: string[]): Set<string> {
  const out = new Set<string>();
  for (const x of raw) {
    const s = String(x).trim();
    if (!s) continue;
    if (
      /^(met|artic|harvard|cleveland|whitney|rijks|ngl|getty|vam|mplus|nma|cooper):/.test(
        s,
      )
    )
      out.add(s);
    else out.add(`met:${s}`);
  }
  return out;
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const count = typeof body.count === "number" ? body.count : 0;
  const exclude = normalizeExcludeIds(
    Array.isArray(body.excludeObjectIds) ? body.excludeObjectIds.map(String) : [],
  );

  if (count < 1 || count > SLOT_COUNT) {
    return NextResponse.json(
      { error: `count must be 1–${SLOT_COUNT}` },
      { status: 400 },
    );
  }

  try {
    const slots = await getRandomArtSlots(count, exclude);
    if (slots.length < count) {
      return NextResponse.json(
        { error: "Could not find enough matching works. Try again." },
        { status: 502 },
      );
    }
    return NextResponse.json({ slots });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "Failed to load artworks from partner museums." },
      { status: 502 },
    );
  }
}
