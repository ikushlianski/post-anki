import { z } from "zod";

// SCENARIO 10: url_match (Scenario 3's free tier) is never conflated with
// embedding_similarity (Scenario 4's capped tier), in either the data or
// the UI.
export const sourceDuplicateMatchKindSchema = z.enum(["url_match", "embedding_similarity"]);

export type SourceDuplicateMatchKind = z.infer<typeof sourceDuplicateMatchKindSchema>;

// Deliberately only three states, no "accepted" — SCENARIO 5: resolving a
// suggestion here never merges or deletes a source, so there is no state
// meaning "the merge happened". "acknowledged" is the closest analogue
// (the human has seen and accepted this as real duplication, without
// destroying either row); "dismissed" is "not actually a duplicate" or
// "duplication I don't care about".
export const sourceDuplicateSuggestionStatusSchema = z.enum([
  "pending",
  "acknowledged",
  "dismissed",
]);

export type SourceDuplicateSuggestionStatus = z.infer<typeof sourceDuplicateSuggestionStatusSchema>;

// sourceAId/sourceBId are an unordered pair, always stored in canonical
// lexicographic order (sourceAId < sourceBId) by the repo, same convention
// as subjectDuplicateSuggestionSchema. similarity is nullable — SCENARIO
// 10: null for a url_match row (no embedding was computed for it), a real
// float for an embedding_similarity row.
export const sourceDuplicateSuggestionSchema = z.object({
  id: z.string(),
  sourceAId: z.string(),
  sourceBId: z.string(),
  similarity: z.number().nullable(),
  matchKind: sourceDuplicateMatchKindSchema,
  reason: z.string().min(1),
  status: sourceDuplicateSuggestionStatusSchema,
  createdAt: z.string(),
  resolvedAt: z.string().nullable(),
});

export type SourceDuplicateSuggestion = z.infer<typeof sourceDuplicateSuggestionSchema>;

// POST /source-duplicate-scans response. exactUrlPairsFound covers Scenario
// 3's free tier (no embedding cost); embeddedCount/reusedCount/capped cover
// Scenario 4's capped tier, same shape as subject-duplicate's own scan
// result. suggestions is every pending suggestion freshly inserted by this
// run, across both tiers.
export const triggerSourceDuplicateScanResultSchema = z.object({
  suggestions: z.array(sourceDuplicateSuggestionSchema),
  exactUrlPairsFound: z.number().int().nonnegative(),
  embeddedCount: z.number().int().nonnegative(),
  reusedCount: z.number().int().nonnegative(),
  capped: z.boolean(),
});

export type TriggerSourceDuplicateScanResult = z.infer<typeof triggerSourceDuplicateScanResultSchema>;

// PATCH /source-duplicate-suggestions/:id. Reporting-only (SCENARIO 5) —
// there is no "accepted with a merge target" branch the way
// resolveSubjectDuplicateSuggestionInput has; the only choice a human makes
// here is whether this pair is worth acting on manually (acknowledged) or
// not a real duplicate (dismissed). Neither writes to sources or
// topics.sourceId.
export const resolveSourceDuplicateSuggestionInput = z.object({
  status: z.enum(["acknowledged", "dismissed"]),
});

export type ResolveSourceDuplicateSuggestionInput = z.infer<
  typeof resolveSourceDuplicateSuggestionInput
>;
