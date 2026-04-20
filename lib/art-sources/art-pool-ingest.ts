/**
 * One row for `ArtPoolEntry` during `npm run art-pool:build`.
 * `poolArtist` is whatever the museum API exposed at ingest (display string), or null.
 */
export type ArtPoolIngestRow = {
  objectId: string;
  poolArtist?: string | null;
};
