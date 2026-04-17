#!/usr/bin/env node
/**
 * Guard for `npm start`: catches incomplete `.next/server` output (e.g. missing
 * numeric chunks) which surfaces as `Cannot find module './611.js'`.
 * Often happens after `next dev` then `next start` without a clean production build.
 */

import fs from "node:fs";
import path from "node:path";

const server = path.join(".next", "server");
const webpackRuntime = path.join(server, "webpack-runtime.js");

if (!fs.existsSync(webpackRuntime)) {
  console.error(
    "\n  No production server bundle found. Run:\n    npm run build\n",
  );
  process.exit(1);
}

const docPath = path.join(server, "pages", "_document.js");
if (!fs.existsSync(docPath)) {
  process.exit(0);
}

const doc = fs.readFileSync(docPath, "utf8");
const chunkIds = new Set();
const bracket = doc.match(/b\.X\(\d+,\[([\d,\s]+)\]/);
if (bracket) {
  for (const raw of bracket[1].split(",")) {
    const id = raw.trim();
    if (/^\d+$/.test(id)) chunkIds.add(id);
  }
}

for (const id of chunkIds) {
  const chunkFile = path.join(server, "chunks", `${id}.js`);
  if (!fs.existsSync(chunkFile)) {
    console.error(
      `\n  Production build is incomplete (missing server/chunks/${id}.js).\n` +
        "  This usually means .next was produced by dev, or a build was interrupted.\n\n" +
        "  Fix:\n    npm run clean && npm run build && npm start\n",
    );
    process.exit(1);
  }
}
