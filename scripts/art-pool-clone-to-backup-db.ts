/**
 * Copies all ArtPoolEntry rows to a second PostgreSQL database (full backup “elsewhere”).
 * Set ART_POOL_BACKUP_DATABASE_URL to a Postgres URL whose schema matches (run migrate deploy there first).
 *
 * Usage: ART_POOL_BACKUP_DATABASE_URL="postgresql://..." npm run art-pool:clone-to-backup-db
 */

import { config as loadEnv } from "dotenv";
loadEnv();
loadEnv({ path: ".env.local" });

import { PrismaClient } from "@prisma/client";

const BATCH = 3_000;

async function main() {
  const backupUrl = process.env.ART_POOL_BACKUP_DATABASE_URL?.trim();
  if (!backupUrl) {
    console.error(
      "Set ART_POOL_BACKUP_DATABASE_URL to a PostgreSQL connection string (second database).",
    );
    process.exitCode = 1;
    return;
  }

  const mainClient = new PrismaClient();
  const backupClient = new PrismaClient({
    datasources: { db: { url: backupUrl } },
  });

  try {
    const total = await mainClient.artPoolEntry.count();
    console.log(`Source (DATABASE_URL): ${total.toLocaleString()} rows in ArtPoolEntry.`);

    await backupClient.$executeRawUnsafe(`TRUNCATE "ArtPoolEntry"`);

    let offset = 0;
    let copied = 0;
    while (offset < total) {
      const rows = await mainClient.artPoolEntry.findMany({
        skip: offset,
        take: BATCH,
        orderBy: { id: "asc" },
      });
      if (rows.length === 0) break;
      await backupClient.artPoolEntry.createMany({
        data: rows.map((r) => ({
          id: r.id,
          source: r.source,
          objectId: r.objectId,
          createdAt: r.createdAt,
        })),
      });
      copied += rows.length;
      offset += BATCH;
      console.log(`  copied ${copied.toLocaleString()} / ${total.toLocaleString()}`);
    }

    const n = await backupClient.artPoolEntry.count();
    console.log(`Backup DB ArtPoolEntry row count: ${n.toLocaleString()}`);
  } finally {
    await mainClient.$disconnect();
    await backupClient.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
