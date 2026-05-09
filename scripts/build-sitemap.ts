/**
 * Generates `public/sitemap.xml` from the database at build time.
 * Run from project root: `npx tsx scripts/build-sitemap.ts`
 *
 * Wired into `npm run build` so every Vercel deploy ships a fresh sitemap
 * without any runtime DB calls (the previous dynamic `app/sitemap.ts`
 * intermittently 500'd on Neon cold starts; see commit b5af243).
 *
 * Filter for listed exhibits MUST stay in sync with `app/exhibits/page.tsx`
 * so the sitemap matches what users can actually browse.
 *
 * Fail-soft: if the DB is unreachable, log a warning and exit 0 so the
 * build still ships the previously committed `public/sitemap.xml`.
 */

import { writeFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";

import { config as loadEnv } from "dotenv";
loadEnv();
loadEnv({ path: ".env.local" });

import { PrismaClient } from "@prisma/client";

import { DEFAULT_SITE_ORIGIN } from "@/lib/site";
import { SLOT_COUNT } from "@/lib/wall-layout";

const ORIGIN = DEFAULT_SITE_ORIGIN;
const OUT_PATH = resolvePath(process.cwd(), "public", "sitemap.xml");
/** Must match `PER_PAGE` in app/exhibits/page.tsx. */
const EXHIBITS_PER_PAGE = 12;

type StaticEntry = {
  path: string;
  changefreq: string;
  priority: string;
};

const STATIC_ENTRIES: StaticEntry[] = [
  { path: "", changefreq: "weekly", priority: "1.0" },
  { path: "/about", changefreq: "monthly", priority: "0.7" },
  { path: "/how-it-works", changefreq: "monthly", priority: "0.7" },
  { path: "/museum-sources", changefreq: "monthly", priority: "0.7" },
  { path: "/faq", changefreq: "monthly", priority: "0.7" },
  { path: "/exhibits", changefreq: "weekly", priority: "0.7" },
];

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function urlEntry(
  loc: string,
  lastmod: string,
  changefreq: string,
  priority: string,
): string {
  return [
    "<url>",
    `<loc>${loc}</loc>`,
    `<lastmod>${lastmod}</lastmod>`,
    `<changefreq>${changefreq}</changefreq>`,
    `<priority>${priority}</priority>`,
    "</url>",
  ].join("\n");
}

async function main(): Promise<void> {
  const buildDate = isoDate(new Date());

  const prisma = new PrismaClient({ log: ["error"] });
  let exhibits: Array<{ id: string; createdAt: Date }> = [];
  try {
    exhibits = await prisma.exhibit.findMany({
      where: {
        featureOnHomepage: true,
        slots: { some: { position: SLOT_COUNT } },
      },
      select: { id: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
  } catch (err) {
    console.warn(
      `[build-sitemap] DB query failed; keeping existing public/sitemap.xml. Reason: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    await prisma.$disconnect().catch(() => {});
    process.exit(0);
  }
  await prisma.$disconnect().catch(() => {});

  const totalPages = Math.max(
    1,
    Math.ceil(exhibits.length / EXHIBITS_PER_PAGE),
  );

  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ];

  for (const e of STATIC_ENTRIES) {
    lines.push(urlEntry(`${ORIGIN}${e.path}`, buildDate, e.changefreq, e.priority));
  }

  for (let page = 2; page <= totalPages; page++) {
    lines.push(
      urlEntry(`${ORIGIN}/exhibits?page=${page}`, buildDate, "weekly", "0.5"),
    );
  }

  for (const ex of exhibits) {
    lines.push(
      urlEntry(
        `${ORIGIN}/e/${ex.id}`,
        isoDate(ex.createdAt),
        "monthly",
        "0.6",
      ),
    );
  }

  lines.push("</urlset>", "");

  writeFileSync(OUT_PATH, lines.join("\n"), "utf8");
  console.log(
    `[build-sitemap] wrote ${OUT_PATH} (${STATIC_ENTRIES.length} static + ${
      Math.max(0, totalPages - 1)
    } pagination + ${exhibits.length} exhibits)`,
  );
}

main().catch((err) => {
  console.warn(
    `[build-sitemap] unexpected error; keeping existing public/sitemap.xml. Reason: ${
      err instanceof Error ? err.message : String(err)
    }`,
  );
  process.exit(0);
});
