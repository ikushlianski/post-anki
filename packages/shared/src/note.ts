import { z } from "zod";
import { NOTE_BODY_MAX_CHARS } from "./text-limits";
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
  body: z.string().min(1).max(NOTE_BODY_MAX_CHARS),
  isHighlight: z.boolean().optional().default(false),
  concern: concernSchema.nullable().optional(),
});

export type CaptureNoteInput = z.infer<typeof captureNoteInput>;

export const NOTE_SEARCH_DEFAULT_LIMIT = 200;
export const NOTE_SEARCH_MAX_LIMIT = 500;

export const noteSearchFiltersSchema = z.object({
  concern: concernSchema.optional(),
  domainNodeId: z.string().optional(),
  limit: z.coerce
    .number()
    .int()
    .positive()
    .max(NOTE_SEARCH_MAX_LIMIT)
    .default(NOTE_SEARCH_DEFAULT_LIMIT),
});

export type NoteSearchFilters = z.infer<typeof noteSearchFiltersSchema>;

export const noteReviewResponseSchema = z.object({
  note: noteSchema.nullable(),
});

export type NoteReviewResponse = z.infer<typeof noteReviewResponseSchema>;
