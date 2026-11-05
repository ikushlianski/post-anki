import { createHash } from "node:crypto";
import { z } from "zod";
import { SPLIT_MAX_SOURCES, SPLIT_MIN_PART_CHARS } from "./long-paste-split.config.js";

const DISALLOWED_TITLE_CHARS = /[^\p{L}\p{N} .,:-]/gu;

const titleSchema = z
  .string()
  .transform((title) => title.replace(DISALLOWED_TITLE_CHARS, " ").replace(/\s+/g, " ").trim().slice(0, 60).trim())
  .pipe(z.string().min(1));

export const splitPlanSchema = z.object({
  sections: z
    .array(
      z.object({
        title: titleSchema,
        startQuote: z.string().min(8).max(200),
      }),
    )
    .min(2)
    .max(SPLIT_MAX_SOURCES),
});

export type SplitPlan = z.infer<typeof splitPlanSchema>;
export type SplitSection = SplitPlan["sections"][number];

export interface SplitPart {
  title: string;
  text: string;
}

export function sliceAtAnchors(text: string, sections: SplitSection[]): SplitPart[] | null {
  const starts: number[] = [];
  let cursor = 0;

  for (const [index, section] of sections.entries()) {
    const found = text.indexOf(section.startQuote, cursor);

    if (found < 0) return null;

    starts.push(index === 0 ? 0 : found);
    cursor = index === 0 ? found + section.startQuote.length : found + 1;
  }

  const parts: SplitPart[] = [];

  for (const [index, section] of sections.entries()) {
    const end = index + 1 < sections.length ? (starts[index + 1] ?? text.length) : text.length;
    const slice = text.slice(starts[index] ?? 0, end);
    const previous = parts[parts.length - 1];

    if (previous !== undefined && slice.length < SPLIT_MIN_PART_CHARS) {
      previous.text += slice;
      continue;
    }

    parts.push({ title: section.title, text: slice });
  }

  return parts.length >= 2 ? parts : null;
}

export function splitImportKeyBase(subjectId: string | null, text: string): string {
  const digest = createHash("sha256").update(`${subjectId ?? ""}\n${text}`).digest("hex");

  return `split:${digest.slice(0, 16)}`;
}
