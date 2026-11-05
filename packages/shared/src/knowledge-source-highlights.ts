import { z } from "zod";

export const KNOWLEDGE_HIGHLIGHTS_MAX = 20;

export const knowledgeHighlightSchema = z
  .object({
    start: z.number().int().min(0),
    end: z.number().int().min(1),
  })
  .refine((range) => range.start < range.end, { message: "start must be less than end" });

export const knowledgeHighlightsSchema = z.array(knowledgeHighlightSchema).max(KNOWLEDGE_HIGHLIGHTS_MAX);

export type KnowledgeHighlight = z.infer<typeof knowledgeHighlightSchema>;

export function mergeHighlights(list: readonly KnowledgeHighlight[] | null | undefined): KnowledgeHighlight[] {
  const sorted = (list ?? [])
    .filter((range) => range.end > range.start)
    .map((range) => ({ start: range.start, end: range.end }))
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: KnowledgeHighlight[] = [];

  for (const range of sorted) {
    const last = merged[merged.length - 1];

    if (last !== undefined && range.start <= last.end) {
      last.end = Math.max(last.end, range.end);

      continue;
    }

    merged.push(range);
  }

  return merged;
}

export function highlightsFitText(list: readonly KnowledgeHighlight[], textLength: number): boolean {
  return list.every((range) => range.start >= 0 && range.end <= textLength);
}

export function shiftHighlights(list: readonly KnowledgeHighlight[], offset: number): KnowledgeHighlight[] {
  return list.map((range) => ({ start: range.start + offset, end: range.end + offset }));
}
