import { z } from "zod";
import { validTimeZoneSchema } from "./time-zone";

export const PRIORITY_PERIOD_KINDS = ["year", "month", "week"] as const;
export const priorityPeriodKindSchema = z.enum(PRIORITY_PERIOD_KINDS);

export type PriorityPeriodKind = z.infer<typeof priorityPeriodKindSchema>;

export const PRIORITY_TARGET_METRICS = ["reviews", "new_cards", "notes", "none"] as const;
export const priorityTargetMetricSchema = z.enum(PRIORITY_TARGET_METRICS);

export type PriorityTargetMetric = z.infer<typeof priorityTargetMetricSchema>;

const PERIOD_KEY_PATTERNS: Record<PriorityPeriodKind, RegExp> = {
  year: /^\d{4}$/,
  month: /^\d{4}-(0[1-9]|1[0-2])$/,
  week: /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/,
};

export function isValidPeriodKey(kind: PriorityPeriodKind, key: string): boolean {
  return PERIOD_KEY_PATTERNS[kind].test(key);
}

const targetValueSchema = z.number().int().min(1).max(1_000_000);
const titleSchema = z.string().trim().min(1).max(200);

export const createSubjectPriorityInput = z
  .object({
    periodKind: priorityPeriodKindSchema,
    periodKey: z.string().min(1),
    title: titleSchema,
    targetMetric: priorityTargetMetricSchema.default("none"),
    targetValue: targetValueSchema.nullable().default(null),
  })
  .superRefine((value, ctx) => {
    if (!isValidPeriodKey(value.periodKind, value.periodKey)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["periodKey"], message: "invalid period key" });
    }

    if (value.targetMetric === "none" && value.targetValue !== null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["targetValue"], message: "target value needs a metric" });
    }
  });

export type CreateSubjectPriorityInput = z.infer<typeof createSubjectPriorityInput>;

export const updateSubjectPriorityInput = z
  .object({
    title: titleSchema.optional(),
    targetMetric: priorityTargetMetricSchema.optional(),
    targetValue: targetValueSchema.nullable().optional(),
    done: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "nothing to update");

export type UpdateSubjectPriorityInput = z.infer<typeof updateSubjectPriorityInput>;

export const listSubjectPrioritiesQuery = z.object({
  period: priorityPeriodKindSchema.optional(),
  tz: validTimeZoneSchema.default("UTC"),
  includeDescendants: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});

export const currentPrioritiesQuery = z.object({
  period: priorityPeriodKindSchema.default("week"),
  tz: validTimeZoneSchema.default("UTC"),
});

export type CurrentPrioritiesQuery = z.infer<typeof currentPrioritiesQuery>;

export type ListSubjectPrioritiesQuery = z.infer<typeof listSubjectPrioritiesQuery>;

export const priorityProgressSchema = z.object({
  reviews: z.number().int().min(0),
  newCards: z.number().int().min(0),
  notes: z.number().int().min(0),
});

export type PriorityProgress = z.infer<typeof priorityProgressSchema>;

export const subjectPrioritySchema = z.object({
  id: z.string(),
  subjectId: z.string(),
  periodKind: priorityPeriodKindSchema,
  periodKey: z.string(),
  title: z.string(),
  targetMetric: priorityTargetMetricSchema,
  targetValue: z.number().int().nullable(),
  doneAt: z.string().nullable(),
  progress: priorityProgressSchema,
  current: z.number().int().min(0).nullable(),
  targetMet: z.boolean(),
});

export type SubjectPriority = z.infer<typeof subjectPrioritySchema>;

export const subjectPriorityListSchema = z.object({
  priorities: z.array(subjectPrioritySchema),
});

export type SubjectPriorityList = z.infer<typeof subjectPriorityListSchema>;

export const dailyGoalSchema = z.object({
  dailyReviewTarget: z.number().int().min(1).max(10_000).nullable(),
});

export type DailyGoal = z.infer<typeof dailyGoalSchema>;

export const updateDailyGoalInput = dailyGoalSchema;

export type UpdateDailyGoalInput = z.infer<typeof updateDailyGoalInput>;

export const timeZoneQuery = z.object({
  tz: validTimeZoneSchema.default("UTC"),
});

export type TimeZoneQuery = z.infer<typeof timeZoneQuery>;

export const dailyGoalProgressSchema = z.object({
  target: z.number().int().nullable(),
  doneToday: z.number().int().min(0),
  dayEndsAt: z.string(),
});

export type DailyGoalProgress = z.infer<typeof dailyGoalProgressSchema>;

export const ADD_KNOWLEDGE_GOAL_PERIODS = ["day", "week"] as const;
export const addKnowledgeGoalPeriodSchema = z.enum(ADD_KNOWLEDGE_GOAL_PERIODS);

export type AddKnowledgeGoalPeriod = z.infer<typeof addKnowledgeGoalPeriodSchema>;

export const putAddKnowledgeGoalInput = z.object({
  subjectId: z.string().min(1),
  period: addKnowledgeGoalPeriodSchema.default("week"),
  targetNotes: z.number().int().min(1).max(10_000),
});

export type PutAddKnowledgeGoalInput = z.infer<typeof putAddKnowledgeGoalInput>;

export const addKnowledgeGoalSchema = z.object({
  id: z.string(),
  subjectId: z.string(),
  period: addKnowledgeGoalPeriodSchema,
  targetNotes: z.number().int(),
});

export type AddKnowledgeGoal = z.infer<typeof addKnowledgeGoalSchema>;

export const addKnowledgeGoalListSchema = z.object({
  goals: z.array(addKnowledgeGoalSchema),
});

export type AddKnowledgeGoalList = z.infer<typeof addKnowledgeGoalListSchema>;

export const addKnowledgeGoalProgressSchema = z.object({
  subjectId: z.string(),
  period: addKnowledgeGoalPeriodSchema,
  target: z.number().int(),
  added: z.number().int().min(0),
  periodEndsAt: z.string(),
});

export type AddKnowledgeGoalProgress = z.infer<typeof addKnowledgeGoalProgressSchema>;

export const addKnowledgeGoalProgressListSchema = z.object({
  goals: z.array(addKnowledgeGoalProgressSchema),
});

export type AddKnowledgeGoalProgressList = z.infer<typeof addKnowledgeGoalProgressListSchema>;
