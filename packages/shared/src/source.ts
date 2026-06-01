import { z } from "zod";

export const sourceKindSchema = z.enum(["link", "text"]);

export type SourceKind = z.infer<typeof sourceKindSchema>;

export const sourceSchema = z.object({
  id: z.string(),
  curriculumId: z.string(),
  kind: sourceKindSchema,
  value: z.string().min(1),
  title: z.string().optional(),
});

export type Source = z.infer<typeof sourceSchema>;

export const sourceDraftSchema = z.object({
  kind: sourceKindSchema,
  value: z.string().min(1),
  title: z.string().optional(),
});

export type SourceDraft = z.infer<typeof sourceDraftSchema>;
