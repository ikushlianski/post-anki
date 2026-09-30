import { z } from "zod";

export const detectedKnowledgeBitSchema = z.object({
  text: z.string().min(1),
  background: z.string().nullable(),
});

export type DetectedKnowledgeBit = z.infer<typeof detectedKnowledgeBitSchema>;
