import { z } from "zod";

export const speedSchema = z.enum(["slow", "normal", "fast"]);

export type Speed = z.infer<typeof speedSchema>;
