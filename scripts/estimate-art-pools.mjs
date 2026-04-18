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

  const metRes = await fetch(
    "https://collectionapi.metmuseum.org/public/collection/v1/search?q=the&hasImages=true&medium=Paintings",
  );
  const met = await metRes.json();
  console.log(
    "Met (example: q=the, medium=Paintings, hasImages): total =",
    met.total ?? "?",
  );

  const cmaRes = await fetch(
    "https://openaccess-api.clevelandart.org/api/artworks/?q=portrait&has_image=1&limit=1",
  );
  const cma = await cmaRes.json();
  console.log(
    "Cleveland (example: q=portrait, has_image): info.total =",
    cma.info?.total ?? "?",
  );

  const whitneyRes = await fetch(
    "https://whitney.org/api/artworks?page=1&q%5Bs%5D=random",
  );
  const whitney = await whitneyRes.json();
  console.log(
    "Whitney (collection, random sort index): meta.total =",
    whitney.meta?.total ?? "?",
  );

  const rijksRes = await fetch(
    "https://data.rijksmuseum.nl/search/collection?imageAvailable=true",
  );
  const rijks = await rijksRes.json();
  console.log(
    "Rijksmuseum (Search API, imageAvailable): partOf.totalItems =",
    rijks.partOf?.totalItems ?? "?",
  );

  const nglRes = await fetch("https://data.ng.ac.uk/es/public/_search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      size: 0,
      query: {
        bool: {
          filter: [
            { term: { "@datatype.base": "object" } },
            { term: { "access.media.public_image": true } },
            { exists: { field: "multimedia" } },
          ],
        },
      },
    }),
  });
  const ngl = await nglRes.json();
  console.log(
    "National Gallery, London (ES: objects with public image + multimedia): hits.total.value =",
    ngl.hits?.total?.value ?? "?",
  );

  const vamRes = await fetch(
    "https://api.vam.ac.uk/v2/objects/search?images_exist=1&page_size=1&page=1",
  );
  const vam = await vamRes.json();
  console.log(
    "V&A (search: images_exist=1): info.record_count =",
    vam.info?.record_count ?? "?",
  );

  const nmaRes = await fetch(
    "https://data.nma.gov.au/object?media=*&limit=1&offset=0",
    { headers: { Accept: "application/json" } },
  );
  const nma = await nmaRes.json();
  console.log(
    "NMA (object search: media=*): meta.results =",
    nma.meta?.results ?? "?",
  );

  const cooperRes = await fetch("https://api.cooperhewitt.org/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: "{ object(size: 1, page: 1, hasImages: true) { id } }",
    }),
  });
  const cooper = await cooperRes.json();
  console.log(
    "Cooper Hewitt (GraphQL: hasImages): extensions.pagination.hits =",
    cooper.extensions?.pagination?.hits ?? "?",
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
