import { z } from "zod";

export const phraseBankStatusSchema = z.enum(["new", "practicing", "struggling", "mastered"]);

export type PhraseBankStatus = z.infer<typeof phraseBankStatusSchema>;

export const phraseBankEntrySchema = z.object({
  id: z.string(),
  subjectId: z.string(),
  level: z.string(),
  pack: z.string(),
  phraseText: z.string(),
  category: z.string().nullable(),
  status: phraseBankStatusSchema,
  masteryStage: z.number().int(),
  correctCountInCycle: z.number().int(),
  incorrectCountInCycle: z.number().int(),
  lastCorrectAtSentenceCount: z.number().int().nullable(),
  lastCorrectDate: z.string().nullable(),
  scheduledForSentenceCount: z.number().int().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  masteredAt: z.string().nullable(),
});

export type PhraseBankEntry = z.infer<typeof phraseBankEntrySchema>;

export const phraseBankAppearanceSchema = z.object({
  id: z.string(),
  phraseBankEntryId: z.string(),
  phraseId: z.string(),
  sentenceCount: z.number().int(),
  result: z.enum(["correct", "incorrect"]),
  score: z.number().int(),
  wasOverdue: z.boolean(),
  createdAt: z.string(),
});

export type PhraseBankAppearance = z.infer<typeof phraseBankAppearanceSchema>;

export const phraseBankSummarySchema = z.object({
  active: z.array(phraseBankEntrySchema),
  mastered: z.array(phraseBankEntrySchema),
});

export type PhraseBankSummary = z.infer<typeof phraseBankSummarySchema>;

export const phraseBankUpdateSchema = z.object({
  id: z.string(),
  phraseText: z.string(),
  category: z.string().nullable(),
  status: phraseBankStatusSchema,
  masteryStage: z.number().int(),
  correctCountInCycle: z.number().int(),
  incorrectCountInCycle: z.number().int(),
  lastCorrectAtSentenceCount: z.number().int().nullable(),
  scheduledForSentenceCount: z.number().int().nullable(),
});

export type PhraseBankUpdate = z.infer<typeof phraseBankUpdateSchema>;
