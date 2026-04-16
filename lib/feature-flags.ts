/**
 * Art Match: gear button, filter modal, `/api/exhibits/cards` query params, and all
 * narrowing in `lib/art-sources/met.ts` (including region post-filter + search boost).
 *
 * Set to `true` to turn filtering back on. Used by:
 * - `components/CreateWizard.tsx` (UI + client fetch)
 * - `app/api/exhibits/cards/route.ts`
 * - `lib/art-sources/met.ts` (`effectiveCardFilters`)
 */
export const ART_FILTERS_ENABLED = false;
