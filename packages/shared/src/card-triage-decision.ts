import { z } from "zod";
import { knowledgeBitFeedbackVerdictSchema, knowledgeBitRejectReasonSchema } from "./knowledge-bit-review-feedback";

export const TRIAGE_DECISION_NOTE_MAX_CHARS = 500;
export const TRIAGE_DECISION_DWELL_MAX_MS = 3_600_000;

export const TRIAGE_DECISION_SOURCES = ["client", "reconciled"] as const;

export const triageDecisionSourceSchema = z.enum(TRIAGE_DECISION_SOURCES);

const dwellMsSchema = z
  .number()
  .finite()
  .min(0)
  .transform((value) => Math.min(Math.round(value), TRIAGE_DECISION_DWELL_MAX_MS));

export const triageDecisionDetailFields = {
  note: z.string().trim().max(TRIAGE_DECISION_NOTE_MAX_CHARS).nullable().optional(),
  reasonCode: knowledgeBitRejectReasonSchema.nullable().optional(),
  dwellMs: dwellMsSchema.optional(),
};

// PUT /triage-sessions/:id/decisions/:bitId
export const putTriageDecisionInput = z
  .object({
    verdict: knowledgeBitFeedbackVerdictSchema,
    ...triageDecisionDetailFields,
  })
  .refine((value) => value.verdict === "rejected" || !value.reasonCode, {
    message: "reasonCode_requires_rejected",
    path: ["reasonCode"],
  });

export type PutTriageDecisionInput = z.input<typeof putTriageDecisionInput>;

export const triageDecisionVariantSchema = z.object({
  id: z.string(),
  kind: z.string(),
  kept: z.boolean(),
});

export type TriageDecisionVariant = z.infer<typeof triageDecisionVariantSchema>;

export const triageDecisionResponse = z.object({
  id: z.string(),
  sessionId: z.string(),
  bitId: z.string(),
  verdict: knowledgeBitFeedbackVerdictSchema,
  reasonCode: knowledgeBitRejectReasonSchema.nullable(),
  note: z.string().nullable(),
  decidedAt: z.string(),
  orderIndex: z.number().int().min(0),
  dwellMs: z.number().int().min(0).nullable(),
  front: z.string().nullable(),
  back: z.string().nullable(),
  variants: z.array(triageDecisionVariantSchema),
  undoneAt: z.string().nullable(),
  source: triageDecisionSourceSchema,
});

export type TriageDecisionResponse = z.infer<typeof triageDecisionResponse>;

// GET /triage-sessions/:id/decisions
export const triageDecisionListResponse = z.object({ decisions: z.array(triageDecisionResponse) });

export type TriageDecisionListResponse = z.infer<typeof triageDecisionListResponse>;
