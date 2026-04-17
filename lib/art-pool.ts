import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ArtSourceId } from "@/lib/art-sources/types";

export async function artPoolCount(source: ArtSourceId): Promise<number> {
  try {
    return await prisma.artPoolEntry.count({ where: { source } });
  } catch {
    return 0;
  }
}

/**
 * Uniform random sample of object IDs from the maintained pool (PostgreSQL ORDER BY RANDOM()).
 * Returns fewer than `take` if the pool is empty or all candidates are excluded.
 */
export async function pickRandomObjectIdsFromPool(
  source: ArtSourceId,
  excludeCompositeKeys: Iterable<string>,
  take: number,
): Promise<string[]> {
  if (take <= 0) return [];

  const prefix = `${source}:`;
  const excludeObjectIds = [...excludeCompositeKeys]
    .filter((k) => k.startsWith(prefix))
    .map((k) => k.slice(prefix.length));

  try {
    if (excludeObjectIds.length === 0) {
      const rows = await prisma.$queryRaw<Array<{ objectId: string }>>(
        Prisma.sql`
        SELECT "objectId" FROM "ArtPoolEntry"
        WHERE source = ${source}
        ORDER BY RANDOM()
        LIMIT ${take}
      `,
      );
      return rows.map((r) => r.objectId);
    }

    const rows = await prisma.$queryRaw<Array<{ objectId: string }>>(
      Prisma.sql`
      SELECT "objectId" FROM "ArtPoolEntry"
      WHERE source = ${source}
      AND "objectId" NOT IN (${Prisma.join(excludeObjectIds)})
      ORDER BY RANDOM()
      LIMIT ${take}
    `,
    );
    return rows.map((r) => r.objectId);
  } catch {
    return [];
  }
}
