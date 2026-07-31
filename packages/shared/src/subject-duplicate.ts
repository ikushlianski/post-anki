import { z } from "zod";

// ai-duplicate-detection (issue #63). "stale" is distinct from "rejected"
// (spec.md Decision #5): a pair a human explicitly said "not a duplicate"
// to is a different fact than a pair that became moot because one side got
// merged or deleted away for an unrelated reason. Both are excluded from
// the pending list; only "rejected" reflects a human judgment about the
// two subjects.
export const subjectDuplicateSuggestionStatusSchema = z.enum([
  "pending",
  "accepted",
  "rejected",
  "stale",
]);

export type SubjectDuplicateSuggestionStatus = z.infer<
  typeof subjectDuplicateSuggestionStatusSchema
>;

// subjectAId/subjectBId are an unordered pair, always stored in canonical
// lexicographic order (subjectAId < subjectBId) by the repo — see
// architecture.md's "Data model evolution". Direction of a merge (which
// subject survives) is chosen by the human at accept time via
// resolveSubjectDuplicateSuggestionInput's targetSubjectId, never implied
// by this ordering.
export const subjectDuplicateSuggestionSchema = z.object({
  id: z.string(),
  subjectAId: z.string(),
  subjectBId: z.string(),
  similarity: z.number(),
  reason: z.string().min(1),
  source: z.string().min(1),
  status: subjectDuplicateSuggestionStatusSchema,
  createdAt: z.string(),
  resolvedAt: z.string().nullable(),
});

export type SubjectDuplicateSuggestion = z.infer<typeof subjectDuplicateSuggestionSchema>;

// POST /subject-duplicate-scans response. embeddedCount/reusedCount/capped
// make the embedding step's cost/backlog state visible to the UI (SCENARIO
// 7 — "embedded 200 of 340 subjects needing a refresh"); suggestions is
// every pending suggestion freshly inserted by this scan (never a pair
// already pending or rejected — see architecture.md's insert-time dedup).
export const triggerSubjectDuplicateScanResultSchema = z.object({
  suggestions: z.array(subjectDuplicateSuggestionSchema),
  embeddedCount: z.number().int().nonnegative(),
  reusedCount: z.number().int().nonnegative(),
  capped: z.boolean(),
});

export type TriggerSubjectDuplicateScanResult = z.infer<
  typeof triggerSubjectDuplicateScanResultSchema
>;

// PATCH /subject-duplicate-suggestions/:id. The human — never the AI —
// chooses which subject survives (spec.md Decision #6); targetSubjectId
// must equal the suggestion's own subjectAId or subjectBId, enforced by the
// repo/controller (Decision #11), never trusted blindly.
export const resolveSubjectDuplicateSuggestionInput = z.discriminatedUnion("status", [
  z.object({ status: z.literal("accepted"), targetSubjectId: z.string() }),
  z.object({ status: z.literal("rejected") }),
]);

export type ResolveSubjectDuplicateSuggestionInput = z.infer<
  typeof resolveSubjectDuplicateSuggestionInput
>;
