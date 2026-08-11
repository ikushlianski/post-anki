import { z } from "zod";
import { concernSchema } from "./concern";

export const noteNodeTypeSchema = z.enum(["topic", "gap", "source"]);

export type NoteNodeType = z.infer<typeof noteNodeTypeSchema>;

export const noteSchema = z.object({
  id: z.string(),
  nodeType: noteNodeTypeSchema,
  nodeId: z.string(),
  body: z.string().min(1),
  isHighlight: z.boolean(),
  concern: concernSchema.nullable(),
  lastSurfacedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Note = z.infer<typeof noteSchema>;

export const captureNoteInput = z.object({
  nodeType: noteNodeTypeSchema,
  nodeId: z.string().min(1),
  body: z.string().min(1),
  isHighlight: z.boolean().optional().default(false),
  concern: concernSchema.nullable().optional(),
});

export type CaptureNoteInput = z.infer<typeof captureNoteInput>;

export const noteSearchFiltersSchema = z.object({
  concern: concernSchema.optional(),
  domainNodeId: z.string().optional(),
});

export type NoteSearchFilters = z.infer<typeof noteSearchFiltersSchema>;

export const noteReviewResponseSchema = z.object({
  note: noteSchema.nullable(),
});

export type NoteReviewResponse = z.infer<typeof noteReviewResponseSchema>;
