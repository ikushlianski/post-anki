import { z } from "zod";

export const practiceLevelSchema = z.enum(["A1_A2", "B1_B2", "C1_C2"]);

export type PracticeLevel = z.infer<typeof practiceLevelSchema>;

export const packSchema = z.enum([
  "General",
  "StandupUpdates",
  "CodeReview",
  "IncidentPostmortems",
  "GivingFeedback",
]);

export type Pack = z.infer<typeof packSchema>;

export const domainSchema = z.enum(["Tech", "SmallTalk", "Everyday"]);

export type Domain = z.infer<typeof domainSchema>;

export const verdictSchema = z.enum(["Ok", "NeedsReview", "NeedsDeepDive"]);

export type Verdict = z.infer<typeof verdictSchema>;

export const phraseSchema = z.object({
  id: z.string(),
  subjectId: z.string(),
  batchId: z.string(),
  level: practiceLevelSchema,
  pack: packSchema,
  position: z.number().int(),
  russian: z.string(),
  referenceEnglish: z.string(),
  domain: domainSchema,
  targetPhraseBankEntryId: z.string().nullable(),
  sequenceNumber: z.number().int(),
  createdAt: z.string(),
});

export type Phrase = z.infer<typeof phraseSchema>;

export const attemptSchema = z.object({
  id: z.string(),
  subjectId: z.string(),
  phraseId: z.string(),
  userAnswer: z.string(),
  score: z.number().int(),
  verdict: verdictSchema,
  feedback: z.string(),
  nativeAlternatives: z.array(z.string()),
  createdAt: z.string(),
});

export type PracticeAttempt = z.infer<typeof attemptSchema>;

export const practiceSettingsSchema = z.object({
  subjectId: z.string(),
  level: practiceLevelSchema,
  pack: packSchema,
});

export type PracticeSettings = z.infer<typeof practiceSettingsSchema>;

export const submitAttemptsInput = z.object({
  answers: z
    .array(
      z.object({
        phraseId: z.string(),
        userAnswer: z.string(),
      }),
    )
    .min(1),
});

export type SubmitAttemptsInput = z.infer<typeof submitAttemptsInput>;

export const updatePracticeSettingsInput = z.object({
  level: practiceLevelSchema.optional(),
  pack: packSchema.optional(),
});

export type UpdatePracticeSettingsInput = z.infer<typeof updatePracticeSettingsInput>;

export const submitWritingCheckInput = z.object({
  text: z.string().trim().min(1).max(5000),
});

export type SubmitWritingCheckInput = z.infer<typeof submitWritingCheckInput>;

export const writingCheckSchema = z.object({
  id: z.string(),
  subjectId: z.string(),
  text: z.string(),
  score: z.number().int(),
  verdict: verdictSchema,
  feedback: z.string(),
  nativeAlternatives: z.array(z.string()),
  createdAt: z.string(),
});

export type WritingCheck = z.infer<typeof writingCheckSchema>;
