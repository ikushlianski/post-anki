import { z } from "zod";

export const pointsReasonSchema = z.enum(["awarded", "daily_card_cap", "too_fast", "not_scored"]);

export type PointsReason = z.infer<typeof pointsReasonSchema>;

export const reviewPointsSchema = z.object({
  awarded: z.number().int().min(0),
  reason: pointsReasonSchema,
  totalPoints: z.number().int().min(0),
  level: z.number().int().min(1),
  leveledUp: z.boolean(),
});

export type ReviewPoints = z.infer<typeof reviewPointsSchema>;

export const playerLevelSchema = z.object({
  level: z.number().int().min(1),
  totalPoints: z.number().int().min(0),
  pointsIntoLevel: z.number().int().min(0),
  pointsForNextLevel: z.number().int().min(0),
});

export type PlayerLevel = z.infer<typeof playerLevelSchema>;

export const badgeFamilySchema = z.enum(["streak", "mastered", "subject_depth", "total_reviews"]);

export type BadgeFamily = z.infer<typeof badgeFamilySchema>;

export const badgeSchema = z.object({
  key: z.string().min(1),
  family: badgeFamilySchema,
  name: z.string().min(1),
  description: z.string(),
  threshold: z.number().int().min(1),
  progress: z.number().int().min(0),
  unlocked: z.boolean(),
});

export type Badge = z.infer<typeof badgeSchema>;

export const gamificationProfileSchema = z.object({
  player: playerLevelSchema,
  todayPoints: z.number().int().min(0),
  streak: z.object({
    current: z.number().int().min(0),
    longest: z.number().int().min(0),
  }),
  masteredCards: z.number().int().min(0),
  badges: z.array(badgeSchema),
});

export type GamificationProfile = z.infer<typeof gamificationProfileSchema>;
