import { z } from "zod";
import { nodeTypeSchema } from "./node-feedback";

export const tagSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  normalizedName: z.string().min(1),
});

export type Tag = z.infer<typeof tagSchema>;

export const tagAssignmentSchema = z.object({
  id: z.string(),
  tagId: z.string(),
  nodeType: nodeTypeSchema,
  nodeId: z.string(),
  createdAt: z.string(),
});

export type TagAssignment = z.infer<typeof tagAssignmentSchema>;

/**
 * A tag as rendered on a specific module/topic — carries the assignment id
 * alongside the tag's own identity, since removing a tag from a node
 * (`DELETE /tags/:tagId/assignments/:assignmentId`) needs the assignment
 * id, not just which tag it is.
 */
export const tagChipSchema = tagSchema.extend({
  assignmentId: z.string(),
});

export type TagChip = z.infer<typeof tagChipSchema>;

export const createTagInput = z.object({
  name: z.string().min(1),
});

export type CreateTagInput = z.infer<typeof createTagInput>;

export const assignTagInput = z.object({
  nodeType: nodeTypeSchema,
  nodeId: z.string(),
});

export type AssignTagInput = z.infer<typeof assignTagInput>;

export const mergeTagsInput = z.object({
  sourceTagId: z.string(),
});

export type MergeTagsInput = z.infer<typeof mergeTagsInput>;

export const mergeTagsResultSchema = z.object({
  targetTagId: z.string(),
  sourceTagId: z.string(),
  assignmentsMoved: z.number(),
  assignmentsDeduped: z.number(),
  sessionsMoved: z.number(),
});

export type MergeTagsResult = z.infer<typeof mergeTagsResultSchema>;
