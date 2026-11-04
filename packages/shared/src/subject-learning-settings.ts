import { z } from "zod";

export const DETAIL_LEVELS = ["concise", "standard", "deep"] as const;

export const detailLevelSchema = z.enum(DETAIL_LEVELS);

export type DetailLevel = z.infer<typeof detailLevelSchema>;

export const DEFAULT_DETAIL_LEVEL: DetailLevel = "standard";

export const DETAIL_LEVEL_PROMPT_LINES: Record<DetailLevel, string> = {
  concise: "Detail level: concise. Keep only the core ideas and write short cards.",
  standard: "",
  deep: "Detail level: deep. Cover supporting details and nuances, and add context where it helps.",
};

export function detailLevelPromptLine(level: DetailLevel | null | undefined): string {
  return DETAIL_LEVEL_PROMPT_LINES[level ?? DEFAULT_DETAIL_LEVEL];
}

export const hintingEnabledSchema = z.boolean();

export const DEFAULT_HINTING_ENABLED = true;

const HINT_SUFFIX = / \(hint: [^)]*\)/g;

export function stripPromptHint(prompt: string): string {
  return prompt.replace(HINT_SUFFIX, "");
}
