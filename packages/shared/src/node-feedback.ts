import { z } from "zod";

export const nodeTypeSchema = z.enum(["module", "topic"]);

export type NodeType = z.infer<typeof nodeTypeSchema>;

export const nodeFeedbackSchema = z.object({
  id: z.string(),
  nodeType: nodeTypeSchema,
  nodeId: z.string(),
  comment: z.string().min(1),
  createdAt: z.string(),
});

export type NodeFeedback = z.infer<typeof nodeFeedbackSchema>;

export const addNodeCommentInput = z.object({
  nodeId: z.string(),
  comment: z.string().min(1),
});

export type AddNodeCommentInput = z.infer<typeof addNodeCommentInput>;
