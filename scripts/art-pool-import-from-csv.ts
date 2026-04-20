/**
 * Restores `ArtPoolEntry` from a CSV produced by `npm run art-pool:export-csv`.
 *
 * Usage:
 *   npm run art-pool:import-csv -- --file ./exports/art-pool-....csv --replace
 *
 * `--replace` truncates `ArtPoolEntry` first (full revert to the snapshot).
 * Without `--replace`, rows are merged (`skipDuplicates` on [source, objectId]).
 */

import { createReadStream } from "node:fs";
import { resolve } from "node:path";
import readline from "node:readline";

import { config as loadEnv } from "dotenv";
loadEnv();
loadEnv({ path: ".env.local" });

import { PrismaClient } from "@prisma/client";

import { parseCsvLine } from "./art-pool-csv";

const prisma = new PrismaClient();
const BATCH = 2_000;

type Row = {
  source: string;
  objectId: string;
  poolArtist: string | null;
  createdAt?: Date;
};

function parseArgs(): { file: string; replace: boolean } {
  const argv = process.argv.slice(2);
  let file = "";
  let replace = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--file") {
      const next = argv[i + 1]?.trim();
      if (next) file = resolve(next);
    } else if (a === "--replace") {
      replace = true;
    } else {
      const fm = a.match(/^--file=(.+)$/);
      if (fm?.[1]?.trim()) file = resolve(fm[1].trim());
    }
  }
  if (!file) {
    throw new Error(
      "Missing --file <path.csv> (create one with npm run art-pool:export-csv).",
    );
  }
  return { file, replace };
}

function mapHeader(cells: string[]): Map<string, number> {
  const m = new Map<string, number>();
  cells.forEach((h, i) => m.set(h.trim().toLowerCase(), i));
  return m;
}

function cell(
  cells: string[],
  idx: number | undefined,
): string {
  if (idx == null || idx < 0 || idx >= cells.length) return "";
  return cells[idx] ?? "";
}

async function main(): Promise<void> {
  let file: string;
  let replace: boolean;
  try {
    ({ file, replace } = parseArgs());
  } catch (e) {
    console.error((e as Error).message);
    process.exitCode = 1;
    return;
  }

  if (replace) {
    const n = await prisma.artPoolEntry.deleteMany({});
    console.log(`Removed ${n.count.toLocaleString()} existing ArtPoolEntry rows (--replace).`);
  }

  const stream = createReadStream(file, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let lineNo = 0;
  let headerMap: Map<string, number> | null = null;
  let buffer: Row[] = [];
  let inserted = 0;

  const flush = async (): Promise<void> => {
    if (buffer.length === 0) return;
    const chunk = buffer;
    buffer = [];
    const result = await prisma.artPoolEntry.createMany({
      data: chunk.map((r) => ({
        source: r.source,
        objectId: r.objectId,
        poolArtist: r.poolArtist,
        ...(r.createdAt ? { createdAt: r.createdAt } : {}),
      })),
      skipDuplicates: true,
    });
    inserted += result.count;
  };

  for await (const line of rl) {
    lineNo++;
    const trimmed = line.trim();
    if (!trimmed) continue;

    const cells = parseCsvLine(trimmed);
    if (headerMap == null) {
      headerMap = mapHeader(cells);
      const need = ["source", "objectid"];
      for (const k of need) {
        if (!headerMap.has(k)) {
          console.error(`CSV header must include ${k}. Got: ${cells.join(",")}`);
          process.exitCode = 1;
          return;
        }
      }
      continue;
    }

    const si = headerMap.get("source");
    const oi = headerMap.get("objectid");
    const pi = headerMap.get("poolartist");
    const ci = headerMap.get("createdat");
    const source = cell(cells, si).trim();
    const objectId = cell(cells, oi).trim();
    if (!source || !objectId) continue;

    const poolRaw = pi != null ? cell(cells, pi) : "";
    const poolArtist = poolRaw.trim() === "" ? null : poolRaw.trim();

    let createdAt: Date | undefined;
    if (ci != null) {
      const raw = cell(cells, ci).trim();
      if (raw) {
        const d = new Date(raw);
        if (!Number.isNaN(d.getTime())) createdAt = d;
      }
    }

    buffer.push({ source, objectId, poolArtist, createdAt });
    if (buffer.length >= BATCH) await flush();
  }

  await flush();

  const total = await prisma.artPoolEntry.count();
  console.log(
    `Import finished: ${inserted.toLocaleString()} new rows applied (skipped duplicates where applicable).`,
  );
  console.log(`ArtPoolEntry row count now: ${total.toLocaleString()}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
