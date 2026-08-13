import { z } from "zod";
import { questionSchema } from "./question";
import { topicProgressSchema } from "./progress";
import { depthLevelSchema } from "./depth";
import { learningStatusSchema } from "./learning-status";
import { gapSchema } from "./gap";
import { prioritySchema } from "./priority";
import { tagChipSchema } from "./tag";

export const selfGradeSchema = z.number().int().min(1).max(5);

export type SelfGrade = z.infer<typeof selfGradeSchema>;

export const topicSchema = z.object({
  id: z.string(),
  moduleId: z.string(),
  title: z.string(),
  summary: z.string().optional(),
  order: z.number().int(),
  priority: prioritySchema,
  included: z.boolean(),
  selfGrade: selfGradeSchema.nullable(),
  depth: depthLevelSchema,
  learningStatus: learningStatusSchema,
  questions: z.array(questionSchema),
  gaps: z.array(gapSchema).optional(),
  progress: topicProgressSchema,
  tags: z.array(tagChipSchema).optional(),
  // lms-buildout 0.4 — when this topic's depth was first elected (null =
  // never asked). Surfaced so callers can stop inferring "has depth been
  // elected?" from `learningStatus !== 'not_started'`
  // (apps/web/src/learning-list/depth-choice.ts's electedDepthForTopic),
  // which conflates two unrelated signals.
  depthElectedAt: z.string().nullable(),
  headroomOfferedAt: z.string().nullable().optional(),
});

export type Topic = z.infer<typeof topicSchema>;

export const createTopicInput = z.object({
  moduleId: z.string(),
  title: z.string().min(1),
  summary: z.string().optional(),
  suggestedDepth: depthLevelSchema.optional(),
});

export type CreateTopicInput = z.infer<typeof createTopicInput>;

export const updateTopicInput = z.object({
  topicId: z.string(),
  title: z.string().min(1).optional(),
  summary: z.string().nullable().optional(),
  moduleId: z.string().optional(),
  order: z.number().int().optional(),
  priority: prioritySchema.optional(),
  included: z.boolean().optional(),
  selfGrade: selfGradeSchema.nullable().optional(),
  depth: depthLevelSchema.optional(),
  learningStatus: learningStatusSchema.optional(),
  // lms-buildout 0.4 — writable directly, rather than only ever inferred
  // from a depth/learningStatus change, so a caller can both stamp and
  // clear it explicitly. `null` clears; omitted leaves it untouched. Bare
  // `z.string()`, matching every other ISO-timestamp field in this file
  // (e.g. `summary` above uses the same nullable/optional shape) — no
  // existing input schema in this package uses `.datetime()`.
  depthElectedAt: z.string().nullable().optional(),
  headroomOfferedAt: z.string().nullable().optional(),
});

export type UpdateTopicInput = z.infer<typeof updateTopicInput>;
