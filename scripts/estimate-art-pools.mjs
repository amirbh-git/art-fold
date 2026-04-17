#!/usr/bin/env node
/**
 * Prints approximate artwork counts from each partner API (public search totals).
 * Run from the project root: `node scripts/estimate-art-pools.mjs`
 * For Harvard totals, set HARVARD_ART_API_KEY in the environment.
 */

async function main() {
  console.log("Approximate pool sizes (search-index totals vary by query):\n");

  const aicRes = await fetch(
    "https://api.artic.edu/api/v1/artworks/search?q=landscape&limit=1",
  );
  const aic = await aicRes.json();
  console.log(
    "AIC (example: q=landscape): pagination.total =",
    aic.pagination?.total ?? "?",
  );

  const cmaRes = await fetch(
    "https://openaccess-api.clevelandart.org/api/artworks/?q=portrait&has_image=1&limit=1",
  );
  const cma = await cmaRes.json();
  console.log(
    "Cleveland (example: q=portrait, has_image): info.total =",
    cma.info?.total ?? "?",
  );

  const hk = process.env.HARVARD_ART_API_KEY?.trim();
  if (hk) {
    const hRes = await fetch(
      `https://api.harvardartmuseums.org/object?apikey=${encodeURIComponent(hk)}&keyword=painting&hasimage=1&size=1`,
    );
    const h = await hRes.json();
    console.log(
      "Harvard (sample query): info.totalrecords =",
      h.info?.totalrecords ?? "?",
    );
  } else {
    console.log(
      "Harvard: skipped (set HARVARD_ART_API_KEY to include Harvard totals)",
    );
  }

  console.log(
    "\nNote: The app samples random searches and pages; perceived repeats are normal until many IDs are excluded.",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
