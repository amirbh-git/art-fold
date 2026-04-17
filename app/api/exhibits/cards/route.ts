import { NextResponse } from "next/server";
import { getRandomArtSlots } from "@/lib/art-sources/random-art";

export const dynamic = "force-dynamic";

const MAX_BATCH = 12;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const count = Math.min(
    Math.max(Number(searchParams.get("count")) || 6, 1),
    MAX_BATCH,
  );
  const excludeRaw = searchParams.get("exclude") ?? "";
  const excludeSet = new Set(
    excludeRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );

  try {
    const cards = await getRandomArtSlots(count, excludeSet);
    return NextResponse.json(
      { cards },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      },
    );
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "Failed to load artworks from partner museums." },
      { status: 502 },
    );
  }
}
