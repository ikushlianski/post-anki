import { z } from "zod";

export const levelSchema = z.enum(["basic", "medium", "advanced"]);

export type Level = z.infer<typeof levelSchema>;

export const LEVEL_RANK: Record<Level, number> = {
  basic: 1,
  medium: 2,
  advanced: 3,
};
