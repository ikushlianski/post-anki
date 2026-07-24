import { z } from "zod";

export const prioritySchema = z.union([
  z.literal(-1),
  z.literal(0),
  z.literal(1),
]);

export type Priority = z.infer<typeof prioritySchema>;
