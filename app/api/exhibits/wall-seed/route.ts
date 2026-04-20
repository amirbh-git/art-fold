import { NextResponse } from "next/server";
import { getRandomArtSlots } from "@/lib/art-sources/random-art";
import { SLOT_COUNT } from "@/lib/wall-layout";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { slots } = await getRandomArtSlots(SLOT_COUNT, new Set());
    if (slots.length < SLOT_COUNT) {
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
