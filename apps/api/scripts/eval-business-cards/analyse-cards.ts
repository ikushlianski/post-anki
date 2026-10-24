import { z } from "zod";

const cardSchema = z.object({
  type: z.enum(["basic", "cloze"]),
  front: z.string(),
  back: z.string().default(""),
  context: z.string().default(""),
  example: z.string().default(""),
  tags: z.array(z.string()).default([]),
  source_quote: z.string().default(""),
  pattern: z.string().optional(),
});

const responseSchema = z.object({
  cards: z.array(cardSchema),
  skipped_note: z.string().default(""),
  dropped_ideas: z.array(z.object({ idea: z.string(), reason: z.string().default("") })).optional(),
});

export type EvalCard = z.infer<typeof cardSchema>;

export interface AnalysedCard extends EvalCard {
  quoteVerbatim: boolean;
  frontWords: number;
  backWords: number;
  metaWords: string[];
  clozeCount: number;
}

export interface Analysis {
  jsonOk: boolean;
  fenceNeeded: boolean;
  schemaOk: boolean;
  error: string | null;
  skippedNote: string;
  droppedIdeas: { idea: string; reason: string }[] | null;
  cards: AnalysedCard[];
}

const META_PATTERN =
  /in this chapter|in this book|the author|the text|this text|the source|the passage|this passage|the book|в этой главе|в этой книге|автор|в тексте|в этом тексте/gi;

function normalise(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

export function countWords(value: string): number {
  return value.trim() === "" ? 0 : value.trim().split(/\s+/).length;
}

function tryParse(raw: string): { value: unknown; fenceNeeded: boolean } | null {
  try {
    return { value: JSON.parse(raw.trim()), fenceNeeded: false };
  } catch {
    const fenced = raw.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);

    if (!fenced?.[1]) {
      return null;
    }

    try {
      return { value: JSON.parse(fenced[1]), fenceNeeded: true };
    } catch {
      return null;
    }
  }
}

export function analyseResponse(raw: string, sourceText: string): Analysis {
  const empty = { jsonOk: false, fenceNeeded: false, schemaOk: false, skippedNote: "", droppedIdeas: null, cards: [] };
  const parsed = tryParse(raw);

  if (!parsed) {
    return { ...empty, error: "response is not valid JSON" };
  }

  const checked = responseSchema.safeParse(parsed.value);

  if (!checked.success) {
    return { ...empty, jsonOk: true, fenceNeeded: parsed.fenceNeeded, error: checked.error.message.slice(0, 300) };
  }

  const haystack = normalise(sourceText);
  const cards = checked.data.cards.map((card) => ({
    ...card,
    quoteVerbatim: card.source_quote.trim() !== "" && haystack.includes(normalise(card.source_quote)),
    frontWords: countWords(card.front),
    backWords: countWords(card.back),
    metaWords: [...new Set(card.front.match(META_PATTERN)?.map((word) => word.toLowerCase()) ?? [])],
    clozeCount: card.front.match(/\{\{c\d+::/g)?.length ?? 0,
  }));

  return {
    jsonOk: true,
    fenceNeeded: parsed.fenceNeeded,
    schemaOk: true,
    error: null,
    skippedNote: checked.data.skipped_note,
    droppedIdeas: checked.data.dropped_ideas ?? null,
    cards,
  };
}

function tokens(value: string): Set<string> {
  return new Set(value.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? []);
}

export function countKnownRepeats(cards: readonly EvalCard[], knownFronts: readonly string[]): number {
  const known = knownFronts.map(tokens);

  return cards.filter((card) => {
    const own = tokens(card.front);

    return known.some((other) => {
      const shared = [...own].filter((token) => other.has(token)).length;
      const union = own.size + other.size - shared;

      return union > 0 && shared / union >= 0.6;
    });
  }).length;
}
