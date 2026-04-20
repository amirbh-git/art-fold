/**
 * One row to insert into `ArtPoolEntry` with `source = "popular"`.
 * `compositeObjectId` is e.g. `met:437882` or `cooper:object-5813`.
 */
export type PopularPoolIngestRow = {
  compositeObjectId: string;
  /** Canonical name from `popular-artists.ts` for this ingest row. */
  poolArtist: string;
};
