import { z } from "zod";
import { validTimeZoneSchema } from "./time-zone";

export const subjectDaySkipsQuerySchema = z.object({
  tz: validTimeZoneSchema.default("UTC"),
});

export const subjectDaySkipsSchema = z.object({
  dayKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  subjectIds: z.array(z.string().min(1)),
});

export type SubjectDaySkips = z.infer<typeof subjectDaySkipsSchema>;
