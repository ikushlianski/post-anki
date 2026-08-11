import { z } from "zod";
import { concernSchema } from "./concern";
import { depthLevelSchema } from "./depth";

export const seriesVerdictValueSchema = z.enum(["single", "series", "unknown"]);

export type SeriesVerdictValue = z.infer<typeof seriesVerdictValueSchema>;

export const seriesPartNumberSchema = z.object({
  part: z.number().int().positive(),
  total: z.number().int().positive().nullable(),
});

export type SeriesPartNumber = z.infer<typeof seriesPartNumberSchema>;

export const seriesSignalsSchema = z.object({
  explicitSeriesPhrase: z.string().nullable(),
  detectedPart: seriesPartNumberSchema.nullable(),
  siblingNavLinkCount: z.number().int().nonnegative(),
  hasPaginationLinks: z.boolean(),
  breadcrumbDepth: z.number().int().nonnegative(),
});

export type SeriesSignals = z.infer<typeof seriesSignalsSchema>;

export const seriesVerdictSchema = z.object({
  verdict: seriesVerdictValueSchema,
  reasons: z.array(z.string()),
});

export type SeriesVerdict = z.infer<typeof seriesVerdictSchema>;

export const learningListDestinationSchema = z.enum([
  "fold_in",
  "mini_course",
  "extend_curriculum",
  "park",
]);

export type LearningListDestination = z.infer<typeof learningListDestinationSchema>;

export const areaMatchSchema = z.object({
  areaId: z.string().min(1),
  areaName: z.string().min(1),
});

export type AreaMatch = z.infer<typeof areaMatchSchema>;

export const existingCurriculumMatchSchema = z.object({
  curriculumId: z.string().min(1),
  title: z.string().min(1),
});

export type ExistingCurriculumMatch = z.infer<typeof existingCurriculumMatchSchema>;

export const taxonomyAreaSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
});

export type TaxonomyArea = z.infer<typeof taxonomyAreaSchema>;

export const ingestionSliceSchema = z.object({
  topicCount: z.number().int().positive(),
  questionCount: z.number().int().positive(),
});

export type IngestionSlice = z.infer<typeof ingestionSliceSchema>;

export const depthHeadroomSchema = z.object({
  nextDepth: depthLevelSchema,
  topDepth: depthLevelSchema,
});

export type DepthHeadroom = z.infer<typeof depthHeadroomSchema>;

export const learningListRecommendationSchema = z.object({
  verdict: seriesVerdictValueSchema,
  reasons: z.array(z.string()),
  destination: learningListDestinationSchema,
  areaId: z.string().nullable(),
  areaName: z.string().nullable(),
  subSubjectNodeId: z.string().nullable(),
  subjectId: z.string(),
  concern: concernSchema.nullable(),
  partCount: z.number().int().nonnegative(),
  existingCurriculumMatch: existingCurriculumMatchSchema.nullable().default(null),
});

export type LearningListRecommendation = z.infer<typeof learningListRecommendationSchema>;

export const learningListItemKindSchema = z.enum(["article", "video"]);

export type LearningListItemKind = z.infer<typeof learningListItemKindSchema>;

export const learningListItemStatusSchema = z.enum([
  "captured",
  "classified",
  "folded_in",
  "parked",
  "course_created",
  "declined",
  "unreachable",
]);

export type LearningListItemStatus = z.infer<typeof learningListItemStatusSchema>;

export const learningListItemSchema = z.object({
  id: z.string(),
  url: z.string().nullable(),
  rawText: z.string().nullable(),
  title: z.string().nullable(),
  kind: learningListItemKindSchema,
  verdict: seriesVerdictValueSchema.nullable(),
  recommendation: learningListRecommendationSchema.nullable(),
  status: learningListItemStatusSchema,
  curriculumId: z.string().nullable(),
  questionsGenerated: z.number().int().nonnegative(),
  questionCeiling: z.number().int().nonnegative().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type LearningListItem = z.infer<typeof learningListItemSchema>;

export const learningListCaptureSchema = z.object({
  url: z.string().min(1),
  pastedDescription: z.string().nullable(),
});

export type LearningListCapture = z.infer<typeof learningListCaptureSchema>;

export const captureLearningListItemInput = z.object({
  url: z.string().min(1),
  kind: learningListItemKindSchema.default("article"),
  pastedDescription: z.string().trim().min(1).nullable().default(null),
  subjectId: z.string().min(1),
  subSubjectNodeId: z.string().min(1).nullable().default(null),
});

export type CaptureLearningListItemInput = z.infer<typeof captureLearningListItemInput>;

export const resolveLearningListRecommendationInput = z.object({
  decision: z.enum(["approve", "decline"]),
});

export type ResolveLearningListRecommendationInput = z.infer<
  typeof resolveLearningListRecommendationInput
>;

export const learningListClassificationSchema = z.object({
  title: z.string(),
  signals: seriesSignalsSchema,
  proposedSubSubjectName: z.string().nullable(),
  proposedAreaName: z.string().nullable(),
  suggestedConcern: z.string().nullable(),
  partCount: z.number().int().nonnegative(),
  siblingUrls: z.array(z.string()).max(20),
});

export type LearningListClassification = z.infer<typeof learningListClassificationSchema>;
