# Scripts

CLI utilities run from the repo root via `npm run …` (see [package.json](../package.json)). Scripts load env from `.env.local` or `.env` where noted in each file.

| Script | Purpose |
|--------|---------|
| `build-art-pool.ts` | Fetch museum object IDs and upsert `ArtPoolEntry` (main pool build; many `art-pool:*` npm aliases). |
| `estimate-art-pools.mjs` | Print approximate artwork counts per API (`npm run art-pools`). |
| `art-pool-archive-full.ts` | Copy all `ArtPoolEntry` rows to `ArtPoolArchive` snapshot table. |
| `art-pool-restore-from-archive.ts` | Restore `ArtPoolEntry` from `ArtPoolArchive`. |
| `art-pool-cap.ts` | Cap row count per source with random sampling. |
| `art-pool-cap-artist-share.ts` | Cap rows per artist / source (maintenance). |
| `art-pool-clone-to-backup-db.ts` | Copy `ArtPoolEntry` to a second DB (`ART_POOL_BACKUP_DATABASE_URL`). |
| `art-pool-export-csv.ts` | Export pool rows to CSV under `exports/` (gitignored). |
| `art-pool-import-from-csv.ts` | Import pool rows from CSV. |
| `art-pool-csv.ts` | RFC 4180 CSV helpers shared by import/export. |
| `count-popular-pool-by-artist.ts` | Count pool rows by artist / source. |
| `benchmark-art-fetch.ts` | Benchmark art API fetch latency. |
| `verify-prod-build.mjs` | Prestart guard (`npm run prestart`). |
