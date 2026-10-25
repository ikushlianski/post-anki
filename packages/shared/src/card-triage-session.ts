import { z } from "zod";
import { triageDecisionDetailFields } from "./card-triage-decision";
import { knowledgeBitFeedbackVerdictSchema } from "./knowledge-bit-review-feedback";

export const STYLE_NOTE_MAX_CHARS = 160;
export const STYLE_NOTES_MAX_COUNT = 8;
export const STYLE_NOTES_BLOCK_MAX_CHARS = 800;
export const TRIAGE_FEEDBACK_MAX_CHARS = 8000;
export const TRIAGE_DECISIONS_MAX = 500;
export const TRIAGE_CARD_FEEDBACK_MAX_ITEMS = 20;

export const TRIAGE_SESSION_STATUSES = ["open", "saved_text_only", "distilled", "discarded"] as const;

export const triageSessionStatusSchema = z.enum(TRIAGE_SESSION_STATUSES);

export type TriageSessionStatus = z.infer<typeof triageSessionStatusSchema>;

// POST /triage-sessions
export const TRIAGE_SESSION_CLIENTS = ["web", "ios", "mac"] as const;

export const triageSessionClientSchema = z.enum(TRIAGE_SESSION_CLIENTS);

export type TriageSessionClient = z.infer<typeof triageSessionClientSchema>;

export const TRIAGE_SESSION_ENDED_BY = ["user", "discarded"] as const;

export const triageSessionEndedBySchema = z.enum(TRIAGE_SESSION_ENDED_BY);

export type TriageSessionEndedBy = z.infer<typeof triageSessionEndedBySchema>;

export const startTriageSessionInput = z.object({
  subjectId: z.string().min(1).nullable().optional(),
  client: triageSessionClientSchema.optional(),
  startKey: z.string().trim().min(1).max(100).optional(),
});

export type StartTriageSessionInput = z.input<typeof startTriageSessionInput>;

export const triageDecisionSchema = z.object({
  bitId: z.string().min(1),
  verdict: knowledgeBitFeedbackVerdictSchema,
  ...triageDecisionDetailFields,
});

export type TriageDecision = z.infer<typeof triageDecisionSchema>;

// POST /triage-sessions/:id/finish
export const finishTriageSessionInput = z.object({
  feedbackText: z.string().trim().max(TRIAGE_FEEDBACK_MAX_CHARS).default(""),
  decisions: z.array(triageDecisionSchema).max(TRIAGE_DECISIONS_MAX).default([]),
  undecidedCount: z.number().int().min(0).optional(),
});

export type FinishTriageSessionInput = z.input<typeof finishTriageSessionInput>;

// POST /triage-sessions/:id/discards
export const discardTriageSessionInput = z.object({
  undecidedCount: z.number().int().min(0).optional(),
});

export type DiscardTriageSessionInput = z.input<typeof discardTriageSessionInput>;

export const cardStyleNoteScopeSchema = z.enum(["subject", "global"]);

export type CardStyleNoteScope = z.infer<typeof cardStyleNoteScopeSchema>;

export const cardStyleNoteSchema = z.object({
  id: z.string(),
  subjectId: z.string().nullable(),
  sessionId: z.string().nullable(),
  text: z.string().min(1).max(STYLE_NOTE_MAX_CHARS),
  enabled: z.boolean(),
  createdAt: z.string(),
});

export type CardStyleNote = z.infer<typeof cardStyleNoteSchema>;

export const triageSessionResponse = z.object({
  id: z.string(),
  subjectId: z.string().nullable(),
  status: triageSessionStatusSchema,
  startedAt: z.string(),
  endedAt: z.string().nullable(),
  acceptedCount: z.number().int().min(0),
  rejectedCount: z.number().int().min(0),
  feedbackText: z.string().nullable(),
  client: triageSessionClientSchema.nullable().optional(),
  endedBy: triageSessionEndedBySchema.nullable().optional(),
  undecidedCount: z.number().int().min(0).nullable().optional(),
  lastActivityAt: z.string().nullable().optional(),
  notes: z.array(cardStyleNoteSchema),
});

export type TriageSessionResponse = z.infer<typeof triageSessionResponse>;

// PATCH /card-style-notes/:id
export const updateCardStyleNoteInput = z
  .object({
    text: z.string().trim().min(1).max(STYLE_NOTE_MAX_CHARS).optional(),
    enabled: z.boolean().optional(),
    subjectId: z.string().min(1).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "empty_update" });

export type UpdateCardStyleNoteInput = z.input<typeof updateCardStyleNoteInput>;

// GET /card-style-notes?subjectId=
export const listCardStyleNotesQuery = z.object({
  subjectId: z.string().min(1).optional(),
});

export const cardStyleNoteListResponse = z.object({ notes: z.array(cardStyleNoteSchema) });

export type CardStyleNoteListResponse = z.infer<typeof cardStyleNoteListResponse>;
