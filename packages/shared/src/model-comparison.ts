import { z } from "zod";
import { knowledgeItemModelIdSchema } from "./knowledge-item-model";

export const MODEL_COMPARISON_MAX_MODELS = 6;
export const MODEL_COMPARISON_MAX_EXCERPT_CHARS = 6000;
export const MODEL_COMPARISON_MAX_ESTIMATED_COST_USD = 0.25;

export const compareModelsInput = z.object({
  excerpt: z.string().trim().min(1).max(MODEL_COMPARISON_MAX_EXCERPT_CHARS),
  modelIds: z
    .array(knowledgeItemModelIdSchema)
    .min(1)
    .max(MODEL_COMPARISON_MAX_MODELS)
    .refine((ids) => new Set(ids).size === ids.length, "Each model can be chosen once"),
});

export type CompareModelsInput = z.infer<typeof compareModelsInput>;

export interface ModelComparisonCostEstimate {
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
}

export interface ModelComparisonEstimate {
  perModel: ModelComparisonCostEstimate[];
  totalEstimatedCostUsd: number;
  chunkCount: number;
  withinCap: boolean;
}

export interface ModelComparisonCard {
  statement: string;
  question: string;
  answer: string;
  kind: string;
  quote: string;
}

export interface ModelComparisonModelResult {
  modelId: string;
  status: "ok" | "failed";
  ms: number;
  returned: number;
  cards: ModelComparisonCard[];
  dropped: string[];
  error: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  actualCostUsd: number | null;
}

export interface ModelComparisonRunResult {
  runId: string;
  startedAt: string;
  results: ModelComparisonModelResult[];
}

const grade = z.number().int().min(1).max(5);

export const MODEL_COMPARISON_NOTE_MAX_CHARS = 500;
export const MODEL_COMPARISON_RUN_LIST_LIMIT = 20;
export const MODEL_COMPARISON_PREVIEW_CHARS = 120;

export const gradeModelResultInput = z
  .object({
    extractionRating: grade.optional(),
    note: z.string().trim().max(MODEL_COMPARISON_NOTE_MAX_CHARS).nullable().optional(),
  })
  .refine((value) => value.extractionRating !== undefined || value.note !== undefined, "Nothing to update");

export type GradeModelResultInput = z.infer<typeof gradeModelResultInput>;

export const gradeComparisonCardInput = z
  .object({
    rating: grade.optional(),
    wordingRating: grade.optional(),
  })
  .refine((value) => value.rating !== undefined || value.wordingRating !== undefined, "Nothing to update");

export type GradeComparisonCardInput = z.infer<typeof gradeComparisonCardInput>;

export interface ModelComparisonCardGradeView {
  cardIndex: number;
  rating: number | null;
  wordingRating: number | null;
}

export interface ModelComparisonGradedResult extends ModelComparisonModelResult {
  estimatedCostUsd: number | null;
  extractionRating: number | null;
  extractionNote: string | null;
  cardGrades: ModelComparisonCardGradeView[];
}

export interface ModelComparisonRunDetail {
  runId: string;
  createdAt: string;
  excerpt: string;
  estimatedCostUsd: number;
  results: ModelComparisonGradedResult[];
}

export interface ModelComparisonRunSummary {
  runId: string;
  createdAt: string;
  modelIds: string[];
  excerptPreview: string;
}
