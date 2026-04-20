import { NextResponse } from "next/server";
import {
  getRandomArtSlots,
  type RandomArtDeckSession,
} from "@/lib/art-sources/random-art";
import type { ArtSourceId } from "@/lib/art-sources/types";
import { isArtSourceId } from "@/lib/art-sources/types";

export const dynamic = "force-dynamic";

const MAX_BATCH = 12;

function parseDeckSession(
  searchParams: URLSearchParams,
): RandomArtDeckSession | null {
  const orderRaw = searchParams.get("order");
  const cursorRaw = searchParams.get("cursor");
  if (!orderRaw?.trim() || cursorRaw == null || cursorRaw === "") return null;
  const parts = orderRaw.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0 || !parts.every((p) => isArtSourceId(p))) return null;
  const startIndex = Number(cursorRaw);
  if (!Number.isFinite(startIndex) || startIndex < 0) return null;
  return {
    sourceOrder: parts as ArtSourceId[],
    startIndex: Math.floor(startIndex),
  };
}

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
  const session = parseDeckSession(searchParams);

  try {
    const { slots, sourceOrder, nextStartIndex } = await getRandomArtSlots(
      count,
      excludeSet,
      session,
    );
    return NextResponse.json(
      { cards: slots, sourceOrder, nextCursor: nextStartIndex },
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
