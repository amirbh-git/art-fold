/**
 * Writes all `ArtPoolEntry` rows to a CSV file (local backup before rebuild).
 *
 * Usage (from project root):
 *   npm run art-pool:export-csv
 *   npm run art-pool:export-csv -- --out ./my-backup.csv
 *   npm run art-pool:export-csv -- --only popular
 *
 * Columns: source, objectId, poolArtist, createdAt (ISO 8601)
 */

import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { config as loadEnv } from "dotenv";
loadEnv();
loadEnv({ path: ".env.local" });

import { PrismaClient } from "@prisma/client";

import { csvEscapeCell } from "./art-pool-csv";

const prisma = new PrismaClient();

const BATCH = 4_000;

function parseOnlySource(): string | null {
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--only") {
      const next = argv[i + 1]?.trim();
      if (next) return next;
      return null;
    }
    const eq = a.match(/^--only=(.+)$/);
    if (eq?.[1]?.trim()) return eq[1].trim();
  }
  return null;
}

function hasExplicitOutArg(): boolean {
  const argv = process.argv.slice(2);
  return argv.some((a) => a === "--out" || a.startsWith("--out="));
}

function parseOutPath(onlySource: string | null): string {
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--out") {
      const next = argv[i + 1]?.trim();
      if (next) return resolve(next);
    }
    const eq = a.match(/^--out=(.+)$/);
    if (eq?.[1]?.trim()) return resolve(eq[1].trim());
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  if (onlySource && !hasExplicitOutArg()) {
    return resolve(
      process.cwd(),
      "exports",
      `art-pool-${onlySource}-${stamp}.csv`,
    );
  }
  return resolve(process.cwd(), "exports", `art-pool-${stamp}.csv`);
}

async function main(): Promise<void> {
  const onlySource = parseOnlySource();
  const outPath = parseOutPath(onlySource);

  await mkdir(dirname(outPath), { recursive: true });

  const where = onlySource ? { source: onlySource } : undefined;
  const total = await prisma.artPoolEntry.count({ where });
  const label = onlySource ? `source=${onlySource}` : "all sources";
  console.log(`Exporting ${total.toLocaleString()} rows (${label}) → ${outPath}`);

  const ws = createWriteStream(outPath, { encoding: "utf8" });
  ws.setMaxListeners(0);
  ws.write("source,objectId,poolArtist,createdAt\n");

  let lastId: string | null = null;
  let written = 0;

  type PoolRow = {
    id: string;
    source: string;
    objectId: string;
    poolArtist: string | null;
    createdAt: Date;
  };

  for (;;) {
    const rows: PoolRow[] = await prisma.artPoolEntry.findMany({
      where: {
        ...(where ?? {}),
        ...(lastId ? { id: { gt: lastId } } : {}),
      },
      orderBy: { id: "asc" },
      take: BATCH,
      select: {
        id: true,
        source: true,
        objectId: true,
        poolArtist: true,
        createdAt: true,
      },
    });
    if (rows.length === 0) break;

    let chunk = "";
    for (const r of rows) {
      chunk +=
        [
          csvEscapeCell(r.source),
          csvEscapeCell(r.objectId),
          csvEscapeCell(r.poolArtist ?? ""),
          csvEscapeCell(r.createdAt.toISOString()),
        ].join(",") + "\n";
      lastId = r.id;
    }
    if (!ws.write(chunk)) {
      await new Promise<void>((res, rej) => {
        ws.once("drain", res);
        ws.once("error", rej);
      });
    }
    written += rows.length;
    if (written % (BATCH * 5) === 0 || written === total) {
      console.log(`  … ${written.toLocaleString()} / ${total.toLocaleString()}`);
    }
  }

  await new Promise<void>((res, rej) => {
    ws.end(() => res());
    ws.on("error", rej);
  });

  console.log(`Done. Wrote ${written.toLocaleString()} data rows (+ header).`);
  console.log(
    "Restore later: npm run art-pool:import-csv -- --file <path> --replace",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
