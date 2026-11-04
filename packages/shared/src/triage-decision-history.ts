import { z } from "zod";
import { knowledgeBitFeedbackVerdictSchema, knowledgeBitRejectReasonSchema } from "./knowledge-bit-review-feedback";
import { rejectSubjectTypeSchema } from "./reject-reasons-by-subject-type";
import { TRIAGE_DECISION_NOTE_MAX_CHARS } from "./card-triage-decision";

export const TRIAGE_HISTORY_DEFAULT_DAYS = 7;
export const TRIAGE_HISTORY_MAX_DAYS = 30;
export const TRIAGE_HISTORY_QUERY_MAX_CHARS = 200;
export const TRIAGE_HISTORY_SEARCH_MODES = ["text", "meaning", "both"] as const;

export const triageHistorySearchModeSchema = z.enum(TRIAGE_HISTORY_SEARCH_MODES);

export type TriageHistorySearchMode = z.infer<typeof triageHistorySearchModeSchema>;

// GET /triage-decisions/recent
export const triageHistoryQuery = z.object({
  days: z.coerce.number().int().min(1).max(TRIAGE_HISTORY_MAX_DAYS).default(TRIAGE_HISTORY_DEFAULT_DAYS),
  q: z.string().trim().max(TRIAGE_HISTORY_QUERY_MAX_CHARS).default(""),
  mode: triageHistorySearchModeSchema.default("both"),
});

export type TriageHistoryQuery = z.output<typeof triageHistoryQuery>;

export const triageHistoryItem = z.object({
  id: z.string(),
  sessionId: z.string(),
  bitId: z.string(),
  verdict: knowledgeBitFeedbackVerdictSchema,
  reasonCode: knowledgeBitRejectReasonSchema.nullable(),
  note: z.string().nullable(),
  decidedAt: z.string(),
  front: z.string().nullable(),
  back: z.string().nullable(),
  subjectType: rejectSubjectTypeSchema,
  rejectReasonCodes: z.array(z.string()),
  extractionModelId: z.string().nullable(),
  fusionModelIds: z.array(z.string()),
  score: z.number().nullable(),
  matchedBy: z.enum(["text", "meaning", "both"]).nullable(),
});

export type TriageHistoryItem = z.infer<typeof triageHistoryItem>;

export const triageHistoryResponse = z.object({
  days: z.number().int(),
  mode: triageHistorySearchModeSchema,
  meaningUnavailable: z.boolean(),
  decisions: z.array(triageHistoryItem),
});

export type TriageHistoryResponse = z.infer<typeof triageHistoryResponse>;

// PATCH /triage-decisions/:id
export const patchTriageDecisionInput = z
  .object({
    reasonCode: knowledgeBitRejectReasonSchema.nullable().optional(),
    note: z.string().trim().max(TRIAGE_DECISION_NOTE_MAX_CHARS).nullable().optional(),
  })
  .refine((value) => value.reasonCode !== undefined || value.note !== undefined, {
    message: "reasonCode_or_note_required",
  });

export type PatchTriageDecisionInput = z.input<typeof patchTriageDecisionInput>;
