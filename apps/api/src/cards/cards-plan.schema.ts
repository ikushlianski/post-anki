import { z } from "zod";

export const cardsPlanSchema = z.object({
  cards: z
    .array(
      z.object({
        concept: z.string(),
        variants: z
          .array(
            z.object({
              prompt: z.string(),
              answer: z.string(),
            }),
          )
          .min(3)
          .max(5),
      }),
    )
    .min(1),
});

export type CardsPlan = z.infer<typeof cardsPlanSchema>;
