/**
 * Caps `poolArtist` concentration for one `ArtPoolEntry.source` (e.g. harvard, whitney).
 *
 * Share mode (default): any non-empty `poolArtist` with more than `--max-frac` × (all
 * rows for that source) has excess rows removed at random until at the cap.
 *
 * Named-artist mode: `--artist-exact-name` + `--artist-max-rows` caps that single
 * `poolArtist` string to an absolute row count (e.g. trim V&A "Francis Frith" to 130).
 *
 * Fixed cap mode: `--cap-rows-per-artist N` caps every non-empty `poolArtist` at N rows
 * (random deletes). Use for `popular` without recomputing the composite pool.
 *
 * Usage:
 *   npm run art-pool:cap-artist-share -- --source harvard --max-frac 0.01
 *   npm run art-pool:cap-artist-share -- --source whitney --max-frac 0.01
 *   npm run art-pool:cap-artist-share -- --source vam --artist-exact-name "Francis Frith" --artist-max-rows 130
 *   npm run art-pool:cap-popular-1k
 *   npm run art-pool:cap-popular-500
 *   npm run art-pool:cap-artist-share -- --source popular --cap-rows-per-artist 1000
 * Skip names (exact `poolArtist` match, case-sensitive), repeat flag or commas:
 *   --skip-artist "Some Name"
 *   --skip-artists="Foo,Bar"
 * Harvard always skips `Unidentified Artist` (npm cannot pass spaces in `=value` reliably).
 * `npm run art-pool:cap-harvard` → harvard @ 1% with that default.
 */

import { config as loadEnv } from "dotenv";
loadEnv();
loadEnv({ path: ".env.local" });

import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const POOL_SOURCES = [
  "artic",
  "met",
  "cleveland",
  "whitney",
  "rijks",
  "harvard",
  "ngl",
  "getty",
  "vam",
  "mplus",
  "nma",
  "cooper",
  "popular",
] as const;

function parseSkipArtists(argv: string[]): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--skip-artist") {
      const next = argv[i + 1]?.trim();
      if (next) out.add(next);
    } else if (a === "--skip-artists") {
      const next = argv[i + 1]?.trim();
      if (next) {
        for (const part of next.split(",")) {
          const t = part.trim();
          if (t) out.add(t);
        }
      }
    } else {
      const one = a.match(/^--skip-artist=(.+)$/);
      if (one?.[1]?.trim()) out.add(one[1].trim());
      const many = a.match(/^--skip-artists=(.+)$/);
      if (many?.[1]) {
        for (const part of many[1].split(",")) {
          const t = part.trim();
          if (t) out.add(t);
        }
      }
    }
  }
  return out;
}

type ParsedArgs =
  | {
      mode: "share";
      source: string;
      maxFrac: number;
      skipArtists: Set<string>;
    }
  | {
      mode: "namedMax";
      source: string;
      artistExactName: string;
      artistMaxRows: number;
    }
  | {
      mode: "fixedCap";
      source: string;
      capRowsPerArtist: number;
      skipArtists: Set<string>;
    };

function parseArgs(): ParsedArgs {
  const argv = process.argv.slice(2);
  let source = "";
  let maxFrac = 0.01;
  let artistExactName = "";
  let artistMaxRows: number | null = null;
  let capRowsPerArtist: number | null = null;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--source") {
      const next = argv[i + 1]?.trim();
      if (next) source = next;
    } else if (a === "--max-frac") {
      const next = argv[i + 1]?.trim();
      if (next) maxFrac = Number.parseFloat(next);
    } else if (a === "--artist-exact-name") {
      const next = argv[i + 1]?.trim();
      if (next) artistExactName = next;
    } else if (a === "--artist-max-rows") {
      const next = argv[i + 1]?.trim();
      if (next) artistMaxRows = Number.parseInt(next, 10);
    } else if (a === "--cap-rows-per-artist") {
      const next = argv[i + 1]?.trim();
      if (next) capRowsPerArtist = Number.parseInt(next, 10);
    } else {
      const sm = a.match(/^--source=(.+)$/);
      if (sm?.[1]?.trim()) source = sm[1].trim();
      const fm = a.match(/^--max-frac=(.+)$/);
      if (fm?.[1]?.trim()) maxFrac = Number.parseFloat(fm[1].trim());
      const an = a.match(/^--artist-exact-name=(.+)$/);
      if (an?.[1]?.trim()) artistExactName = an[1].trim();
      const ar = a.match(/^--artist-max-rows=(.+)$/);
      if (ar?.[1]?.trim()) artistMaxRows = Number.parseInt(ar[1].trim(), 10);
      const cr = a.match(/^--cap-rows-per-artist=(.+)$/);
      if (cr?.[1]?.trim()) capRowsPerArtist = Number.parseInt(cr[1].trim(), 10);
    }
  }

  if (!source) {
    throw new Error("Missing --source <artic|met|…|popular>");
  }
  if (!(POOL_SOURCES as readonly string[]).includes(source)) {
    throw new Error(`Unknown source "${source}".`);
  }

  const hasNamed =
    artistExactName.length > 0 &&
    artistMaxRows != null &&
    Number.isFinite(artistMaxRows);

  if (hasNamed) {
    if (!Number.isFinite(artistMaxRows!) || artistMaxRows! < 1) {
      throw new Error("--artist-max-rows must be a positive integer.");
    }
    return {
      mode: "namedMax",
      source,
      artistExactName,
      artistMaxRows: artistMaxRows!,
    };
  }

  const skipArtists = parseSkipArtists(argv);
  if (source === "harvard") {
    skipArtists.add("Unidentified Artist");
  }

  if (
    capRowsPerArtist != null &&
    Number.isFinite(capRowsPerArtist) &&
    capRowsPerArtist >= 1
  ) {
    return {
      mode: "fixedCap",
      source,
      capRowsPerArtist,
      skipArtists,
    };
  }

  if (!Number.isFinite(maxFrac) || maxFrac <= 0 || maxFrac > 1) {
    throw new Error("--max-frac must be a number in (0, 1].");
  }
  return { mode: "share", source, maxFrac, skipArtists };
}

async function capNamedArtistToMaxRows(
  source: string,
  artistName: string,
  maxRows: number,
): Promise<void> {
  const c = await prisma.artPoolEntry.count({
    where: { source, poolArtist: artistName },
  });
  if (c <= maxRows) {
    console.log(
      `source=${source}  artist=${JSON.stringify(artistName)}  rows=${c} (already ≤ ${maxRows}). Nothing to do.`,
    );
    return;
  }
  const excess = c - maxRows;
  console.log(
    `source=${source}  artist=${JSON.stringify(artistName)}  ${c} → ${maxRows} (deleting ${excess})`,
  );
  const res = await prisma.$executeRaw(
    Prisma.sql`
      DELETE FROM "ArtPoolEntry"
      WHERE id IN (
        SELECT id FROM "ArtPoolEntry"
        WHERE source = ${source}
          AND "poolArtist" = ${artistName}
        ORDER BY RANDOM()
        LIMIT ${excess}
      )
    `,
  );
  const deleted = typeof res === "number" ? res : 0;
  const after = await prisma.artPoolEntry.count({ where: { source } });
  console.log(
    `Done. Deleted ${deleted.toLocaleString()} rows. source=${source} total rows now: ${after.toLocaleString()}.`,
  );
}

async function trimArtistsOverFixedCap(
  source: string,
  cap: number,
  skipArtists: Set<string>,
  logLabel: string,
): Promise<number> {
  const poolTotal = await prisma.artPoolEntry.count({ where: { source } });
  if (poolTotal === 0) {
    console.log(`No rows for source=${source}. Nothing to do.`);
    return 0;
  }

  const namedRows = await prisma.artPoolEntry.count({
    where: { source, poolArtist: { not: null }, NOT: { poolArtist: "" } },
  });
  if (namedRows === 0) {
    console.log(`No rows with poolArtist for source=${source}. Nothing to do.`);
    return 0;
  }

  const skipMsg =
    skipArtists.size > 0
      ? `  skip_artists=${[...skipArtists].map((s) => JSON.stringify(s)).join(", ")}`
      : "";
  console.log(
    `source=${source}  pool_rows=${poolTotal.toLocaleString()}  rows_with_poolArtist=${namedRows.toLocaleString()}  cap_per_artist=${cap}  (${logLabel})${skipMsg}`,
  );

  const groups = await prisma.artPoolEntry.groupBy({
    by: ["poolArtist"],
    where: { source, poolArtist: { not: null }, NOT: { poolArtist: "" } },
    _count: { _all: true },
  });

  let totalDeleted = 0;
  for (const g of groups) {
    const name = g.poolArtist;
    const c = g._count._all;
    if (name == null || c <= cap) continue;
    if (skipArtists.has(name)) {
      console.log(
        `  (skipped) ${name.slice(0, 72)}${name.length > 72 ? "…" : ""}: ${c} rows (no cap)`,
      );
      continue;
    }
    const excess = c - cap;
    const res = await prisma.$executeRaw(
      Prisma.sql`
        DELETE FROM "ArtPoolEntry"
        WHERE id IN (
          SELECT id FROM "ArtPoolEntry"
          WHERE source = ${source}
            AND "poolArtist" = ${name}
          ORDER BY RANDOM()
          LIMIT ${excess}
        )
      `,
    );
    const deleted = typeof res === "number" ? res : 0;
    totalDeleted += deleted;
    if (deleted > 0) {
      console.log(
        `  ${name.slice(0, 72)}${name.length > 72 ? "…" : ""}: ${c} → ${cap} (−${deleted})`,
      );
    }
  }

  const after = await prisma.artPoolEntry.count({ where: { source } });
  console.log(
    `Done. Deleted ${totalDeleted.toLocaleString()} rows. source=${source} total rows now: ${after.toLocaleString()}.`,
  );
  return totalDeleted;
}

async function main(): Promise<void> {
  let args: ParsedArgs;
  try {
    args = parseArgs();
  } catch (e) {
    console.error((e as Error).message);
    process.exitCode = 1;
    return;
  }

  if (args.mode === "namedMax") {
    await capNamedArtistToMaxRows(
      args.source,
      args.artistExactName,
      args.artistMaxRows,
    );
    return;
  }

  if (args.mode === "fixedCap") {
    await trimArtistsOverFixedCap(
      args.source,
      args.capRowsPerArtist,
      args.skipArtists,
      `fixed cap --cap-rows-per-artist=${args.capRowsPerArtist}`,
    );
    return;
  }

  const { source, maxFrac, skipArtists } = args;

  const poolTotal = await prisma.artPoolEntry.count({ where: { source } });
  if (poolTotal === 0) {
    console.log(`No rows for source=${source}. Nothing to do.`);
    return;
  }

  const cap = Math.max(1, Math.ceil(maxFrac * poolTotal));
  await trimArtistsOverFixedCap(
    source,
    cap,
    skipArtists,
    `max_frac=${maxFrac} of pool_rows`,
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
