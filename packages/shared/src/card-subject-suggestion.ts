import { z } from "zod";

export const cardSubjectSuggestionStatusSchema = z.enum([
  "pending",
  "approved",
  "rejected",
  "no_match",
  "superseded",
]);

export type CardSubjectSuggestionStatus = z.infer<typeof cardSubjectSuggestionStatusSchema>;

export const cardSubjectSuggestionSchema = z.object({
  id: z.string(),
  knowledgeBitId: z.string(),
  cardBody: z.string(),
  suggestedSubjectId: z.string().nullable(),
  suggestedSubjectName: z.string().nullable(),
  confidence: z.enum(["high", "medium"]).nullable(),
  status: cardSubjectSuggestionStatusSchema,
  createdAt: z.string(),
  resolvedAt: z.string().nullable(),
});

export type CardSubjectSuggestion = z.infer<typeof cardSubjectSuggestionSchema>;

// GET /card-subject-suggestions?status=
export const listCardSubjectSuggestionsQuery = z.object({
  status: cardSubjectSuggestionStatusSchema.optional(),
});

// PATCH /card-subject-suggestions/:id
export const resolveCardSubjectSuggestionInput = z.object({
  action: z.enum(["approve", "reject"]),
});

export type ResolveCardSubjectSuggestionInput = z.infer<typeof resolveCardSubjectSuggestionInput>;

// POST /card-subject-suggestion-scans
export const triggerCardSubjectSuggestionScanResult = z.object({
  checked: z.number().int().nonnegative(),
  suggested: z.number().int().nonnegative(),
  noMatch: z.number().int().nonnegative(),
  calls: z.number().int().nonnegative(),
});

export type TriggerCardSubjectSuggestionScanResult = z.infer<
  typeof triggerCardSubjectSuggestionScanResult
>;
