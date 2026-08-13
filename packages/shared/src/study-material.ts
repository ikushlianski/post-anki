import { z } from "zod";

export const studyMaterialKindSchema = z.enum(["worked_example", "analogy"]);

export type StudyMaterialKind = z.infer<typeof studyMaterialKindSchema>;

export const studyMaterialStatusSchema = z.enum(["generating", "ready", "failed"]);

export type StudyMaterialStatus = z.infer<typeof studyMaterialStatusSchema>;

export const studyMaterialCitationSchema = z.object({
  title: z.string(),
  url: z.string(),
});

export type StudyMaterialCitation = z.infer<typeof studyMaterialCitationSchema>;

export const studyMaterialSchema = z.object({
  id: z.string(),
  topicId: z.string(),
  kind: studyMaterialKindSchema,
  status: studyMaterialStatusSchema,
  body: z.string().nullable(),
  citations: z.array(studyMaterialCitationSchema),
  failureReason: z.string().nullable(),
  createdAt: z.string(),
});

export type StudyMaterial = z.infer<typeof studyMaterialSchema>;

export const requestStudyMaterialInput = z.object({
  kind: studyMaterialKindSchema,
});

export type RequestStudyMaterialInput = z.infer<typeof requestStudyMaterialInput>;
