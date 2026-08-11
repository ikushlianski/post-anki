import { z } from "zod";
import { dailyPushSchema } from "./daily-push";
import { probeQuestionSchema } from "./probe";

export const studySessionTargetTypeSchema = z.enum(["learning_path", "domain_node", "curriculum"]);

export type StudySessionTargetType = z.infer<typeof studySessionTargetTypeSchema>;

export const studySessionStatusSchema = z.enum([
  "planned",
  "in_progress",
  "completed",
  "abandoned",
]);

export type StudySessionStatus = z.infer<typeof studySessionStatusSchema>;

export const studySessionSchema = z.object({
  id: z.string(),
  targetType: studySessionTargetTypeSchema.nullable(),
  targetId: z.string().nullable(),
  plannedDurationMinutes: z.number().int().positive(),
  scheduledFor: z.string().nullable(),
  status: studySessionStatusSchema,
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  questionsAnswered: z.number().int(),
  questionsCorrect: z.number().int(),
  createdAt: z.string(),
});

export type StudySession = z.infer<typeof studySessionSchema>;

export const createStudySessionInput = z.object({
  targetType: studySessionTargetTypeSchema.nullable().optional(),
  targetId: z.string().nullable().optional(),
  plannedDurationMinutes: z.number().int().positive(),
  scheduledFor: z.string().nullable().optional(),
});

export type CreateStudySessionInput = z.infer<typeof createStudySessionInput>;

export const recordStudySessionAnswerInput = z.object({
  correct: z.boolean(),
});

export type RecordStudySessionAnswerInput = z.infer<typeof recordStudySessionAnswerInput>;

export const endStudySessionInput = z.object({
  userRequestedEnd: z.boolean().optional(),
});

export type EndStudySessionInput = z.infer<typeof endStudySessionInput>;

export const studySessionPushResponseSchema = z.object({
  push: dailyPushSchema.nullable(),
  question: probeQuestionSchema.nullable(),
});

export type StudySessionPushResponse = z.infer<typeof studySessionPushResponseSchema>;

export const studySessionConsistencySchema = z.object({
  planned: z.number().int(),
  completed: z.number().int(),
  rate: z.number(),
});

export type StudySessionConsistency = z.infer<typeof studySessionConsistencySchema>;

export const studySessionListItemSchema = studySessionSchema.extend({
  missed: z.boolean(),
});

export type StudySessionListItem = z.infer<typeof studySessionListItemSchema>;

export const listStudySessionsResponseSchema = z.array(studySessionListItemSchema);

export type ListStudySessionsResponse = z.infer<typeof listStudySessionsResponseSchema>;
