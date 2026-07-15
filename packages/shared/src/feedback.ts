import { z } from "zod";

export const itemFeedbackTypeSchema = z.enum(["probe_question", "socratic_turn"]);

export type ItemFeedbackType = z.infer<typeof itemFeedbackTypeSchema>;

export const itemFeedbackRatingSchema = z.enum(["up", "down"]);

export type ItemFeedbackRating = z.infer<typeof itemFeedbackRatingSchema>;

export const itemFeedbackSchema = z.object({
  id: z.string(),
  itemType: itemFeedbackTypeSchema,
  itemId: z.string(),
  topicId: z.string().nullable(),
  itemText: z.string(),
  rating: itemFeedbackRatingSchema,
  comment: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ItemFeedback = z.infer<typeof itemFeedbackSchema>;

export const submitItemFeedbackInput = z.object({
  rating: itemFeedbackRatingSchema,
  comment: z.string().trim().min(1).max(500).optional(),
});

export type SubmitItemFeedbackInput = z.infer<typeof submitItemFeedbackInput>;
