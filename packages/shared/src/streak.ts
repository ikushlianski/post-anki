import { z } from "zod";

export const streakSchema = z.object({
  currentStreak: z.number().int().min(0),
  longestStreak: z.number().int().min(0),
  lastActiveDate: z.string().nullable(),
});

export type Streak = z.infer<typeof streakSchema>;
