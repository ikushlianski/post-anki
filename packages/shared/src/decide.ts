import { z } from "zod";

export const decideInput = z.object({
  decision: z.string().min(1),
  opinion: z.string().min(1),
});

export type DecideInput = z.infer<typeof decideInput>;

export const decideResultSchema = z.object({
  strengths: z.array(z.string()),
  blindSpots: z.array(z.string()),
  questions: z.array(z.string()),
  verdict: z.string(),
});

export type DecideResult = z.infer<typeof decideResultSchema>;
