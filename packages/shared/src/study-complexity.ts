import { z } from "zod";

export const complexityLevelSchema = z.enum(["easy", "normal", "cram"]);

export type ComplexityLevel = z.infer<typeof complexityLevelSchema>;

export const COMPLEXITY_RETENTION = { easy: 0.87, cram: 0.935 } as const;

export const complexityViewSchema = z.object({
  level: z.enum(["easy", "normal", "cram", "custom"]),
  source: z.string(),
});

export type ComplexityView = z.infer<typeof complexityViewSchema>;

export const complexityPreviewSchema = z.object({
  goodDays: z.number(),
  easyDays: z.number(),
});

export type ComplexityPreview = z.infer<typeof complexityPreviewSchema>;

export function complexityRetention(level: ComplexityLevel, appDefault: number): number {
  return level === "normal" ? appDefault : COMPLEXITY_RETENTION[level];
}
