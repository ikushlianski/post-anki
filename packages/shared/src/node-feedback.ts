import { z } from "zod";
import { COMMENT_MAX_CHARS } from "./text-limits";

export const nodeTypeSchema = z.enum(["module", "topic"]);

export type NodeType = z.infer<typeof nodeTypeSchema>;

export const nodeFeedbackSchema = z.object({
  id: z.string(),
  nodeType: nodeTypeSchema,
  nodeId: z.string(),
  comment: z.string().min(1).max(COMMENT_MAX_CHARS),
  createdAt: z.string(),
});

export type NodeFeedback = z.infer<typeof nodeFeedbackSchema>;

export const addNodeCommentInput = z.object({
  nodeId: z.string(),
  comment: z.string().min(1).max(COMMENT_MAX_CHARS),
});

export type AddNodeCommentInput = z.infer<typeof addNodeCommentInput>;
