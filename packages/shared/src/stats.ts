import { z } from "zod";
import { nextStepRecommendationSchema } from "./next-step";

export const weakSpotSchema = z.object({
  topicId: z.string(),
  topicTitle: z.string(),
  maturity: z.number().int().min(0).max(100),
  openGapLabels: z.array(z.string()),
});

export type WeakSpot = z.infer<typeof weakSpotSchema>;

export const strongPointSchema = z.object({
  topicId: z.string(),
  topicTitle: z.string(),
  maturity: z.number().int().min(0).max(100),
});

export type StrongPoint = z.infer<typeof strongPointSchema>;

export const topicRecommendationSchema = z.object({
  topicId: z.string(),
  text: z.string(),
  citations: z.array(z.string()),
  generatedAt: z.string(),
});

export type TopicRecommendation = z.infer<typeof topicRecommendationSchema>;

export const curriculumStatsSchema = z.object({
  curriculumId: z.string(),
  attemptedTopicCount: z.number().int().min(0),
  weakSpots: z.array(weakSpotSchema),
  strongPoints: z.array(strongPointSchema),
  recommendationsEligible: z.boolean(),
  recommendations: z.array(topicRecommendationSchema),
  nextStep: nextStepRecommendationSchema,
});

export type CurriculumStats = z.infer<typeof curriculumStatsSchema>;

export const generateRecommendationsResultSchema = z.object({
  recommendations: z.array(topicRecommendationSchema),
  failed: z.boolean(),
});

export type GenerateRecommendationsResult = z.infer<typeof generateRecommendationsResultSchema>;
