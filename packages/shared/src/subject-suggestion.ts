import { z } from "zod";

export const subjectSuggestionKindSchema = z.enum(["new-subject", "sub-subject"]);

export type SubjectSuggestionKind = z.infer<typeof subjectSuggestionKindSchema>;

export const subjectSuggestionStatusSchema = z.enum(["pending", "approved", "dismissed"]);

export type SubjectSuggestionStatus = z.infer<typeof subjectSuggestionStatusSchema>;

export const subjectSuggestionSchema = z.object({
  id: z.string(),
  kind: subjectSuggestionKindSchema,
  parentSubjectId: z.string().nullable(),
  proposedName: z.string(),
  reason: z.string(),
  evidenceCount: z.number().int().nonnegative(),
  evidenceSamples: z.array(z.string().max(200)).max(3),
  status: subjectSuggestionStatusSchema,
  createdSubjectId: z.string().nullable(),
  createdAt: z.string(),
  resolvedAt: z.string().nullable(),
});

export type SubjectSuggestion = z.infer<typeof subjectSuggestionSchema>;

// PATCH /subject-suggestions/:id
export const resolveSubjectSuggestionInput = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("approve"),
    name: z.string().trim().min(2).max(60).optional(),
  }),
  z.object({ action: z.literal("dismiss") }),
]);

export type ResolveSubjectSuggestionInput = z.infer<typeof resolveSubjectSuggestionInput>;

// POST /subject-suggestion-scans
export const triggerSubjectSuggestionScanResult = z.object({
  created: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  calls: z.number().int().nonnegative(),
  budgetStopped: z.boolean(),
});

export type TriggerSubjectSuggestionScanResult = z.infer<typeof triggerSubjectSuggestionScanResult>;
