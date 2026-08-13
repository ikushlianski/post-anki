import { z } from "zod";

export const fetchStateSchema = z.enum(["fetched", "stale_failed", "never_fetched"]);

export type FetchState = z.infer<typeof fetchStateSchema>;

// GET /sources — one row per sources row across every curriculum, joined to
// its curriculum and subject for provenance (SCENARIO 1/2). fetchState is
// derived server-side via resolveFetchState, never left for a client to
// infer from a null check.
export const librarySourceSchema = z.object({
  id: z.string(),
  curriculumId: z.string(),
  curriculumName: z.string(),
  subjectId: z.string(),
  subjectName: z.string(),
  kind: z.string(),
  value: z.string(),
  title: z.string().nullable(),
  fetchState: fetchStateSchema,
  lastFetchedAt: z.string().nullable(),
  lastFetchOutcome: z.string().nullable(),
  createdAt: z.string(),
});

export type LibrarySource = z.infer<typeof librarySourceSchema>;

export const listLibrarySourcesResultSchema = z.array(librarySourceSchema);

// guardedFetchText's own outcome vocabulary, restricted to the four values
// sources.last_fetch_outcome's schema comment permits — a
// too_many_redirects failure is folded into network_error (see
// refetch-link.ts) rather than growing this enum.
export const refetchOutcomeSchema = z.enum(["ok", "blocked", "http_error", "network_error"]);

export type RefetchOutcome = z.infer<typeof refetchOutcomeSchema>;

// POST /sources/:id/refetch. fetchedTextUpdated tells the caller whether
// the body actually changed — SCENARIO 7: a failed re-fetch always writes
// lastFetchedAt/lastFetchOutcome but never fetchedText, so this is false on
// every non-ok outcome.
export const refetchSourceResultSchema = z.object({
  sourceId: z.string(),
  outcome: refetchOutcomeSchema,
  lastFetchedAt: z.string(),
  fetchedTextUpdated: z.boolean(),
});

export type RefetchSourceResult = z.infer<typeof refetchSourceResultSchema>;
