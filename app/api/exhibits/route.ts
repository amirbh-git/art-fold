import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { WallSlotPayload } from "@/lib/art-sources/types";
import { isArtSourceId } from "@/lib/art-sources/types";
import { SLOT_COUNT } from "@/lib/wall-layout";

function saveErrorMessage(error: unknown): string {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2022") {
      return (
        "Database is missing columns (migrations not applied). In the project folder run: npx prisma migrate deploy"
      );
    }
    if (error.code === "P1001") {
      return "Could not connect to the database. Check DATABASE_URL and that the server is reachable.";
    }
  }
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return "Could not open a database connection. Check DATABASE_URL.";
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Could not save exhibit.";
}

const THEME_MAX = 280;
const NAME_MAX = 120;

function isWallSlot(x: unknown): x is WallSlotPayload {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    isArtSourceId(o.source) &&
    typeof o.objectId === "string" &&
    typeof o.title === "string" &&
    typeof o.artist === "string" &&
    typeof o.imageUrl === "string" &&
    typeof o.objectUrl === "string"
  );
}

export async function POST(req: Request) {
  let body: {
    theme?: unknown;
    exhibitTitle?: unknown;
    curatorName?: unknown;
    slots?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rawTheme = typeof body.theme === "string" ? body.theme.trim() : "";
  const rawExhibitTitle =
    typeof body.exhibitTitle === "string" ? body.exhibitTitle.trim() : "";
  const rawCuratorName =
    typeof body.curatorName === "string" ? body.curatorName.trim() : "";

  if (rawTheme.length > THEME_MAX) {
    return NextResponse.json(
      { error: `Description must be at most ${THEME_MAX} characters.` },
      { status: 400 },
    );
  }
  if (rawExhibitTitle.length > NAME_MAX) {
    return NextResponse.json(
      { error: `Exhibit name must be at most ${NAME_MAX} characters.` },
      { status: 400 },
    );
  }
  if (rawCuratorName.length > NAME_MAX) {
    return NextResponse.json(
      { error: `Name must be at most ${NAME_MAX} characters.` },
      { status: 400 },
    );
  }

  if (!Array.isArray(body.slots) || body.slots.length !== SLOT_COUNT) {
    return NextResponse.json(
      { error: `Exactly ${SLOT_COUNT} slots are required.` },
      { status: 400 },
    );
  }

  const slots = body.slots as unknown[];
  if (!slots.every(isWallSlot)) {
    return NextResponse.json({ error: "Invalid slot payload." }, { status: 400 });
  }

  const ordered = slots as WallSlotPayload[];

  try {
    const count = await prisma.exhibit.count();
    const exhibitTitle =
      rawExhibitTitle || `Untitled Exhibit #${count + 1}`;
    const curatorName = rawCuratorName || "Anonymous";

    const exhibit = await prisma.exhibit.create({
      data: {
        theme: rawTheme,
        exhibitTitle,
        curatorName,
        slots: {
          create: ordered.map((s, i) => ({
            position: i + 1,
            source: s.source,
            objectId: s.objectId,
            title: s.title,
            artist: s.artist,
            imageUrl: s.imageUrl,
            objectUrl: s.objectUrl,
          })),
        },
      },
    });

    return NextResponse.json({
      id: exhibit.id,
      exhibitTitle,
      theme: rawTheme,
      curatorName,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: saveErrorMessage(e) }, { status: 500 });
  }
}
