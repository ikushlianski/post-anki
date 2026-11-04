import { z } from "zod";

export const MAX_PHRASE_LINES = 100;
export const MAX_PHRASE_LINE_LENGTH = 500;

// POST /knowledge-sources/phrases
export const createPhraseSourcesInput = z.object({
  lines: z.array(z.string()).min(1).max(MAX_PHRASE_LINES),
});

export type CreatePhraseSourcesInput = z.input<typeof createPhraseSourcesInput>;

export const createPhraseSourcesResult = z.object({
  received: z.number().int().min(0),
  imported: z.number().int().min(0),
  skippedExisting: z.number().int().min(0),
  ignored: z.number().int().min(0),
  duplicatesInInput: z.number().int().min(0),
});

export type CreatePhraseSourcesResult = z.infer<typeof createPhraseSourcesResult>;

export const NON_NATIVE_PHRASE_FLAG = "non_native_phrase";
