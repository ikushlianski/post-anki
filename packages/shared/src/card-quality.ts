import { z } from "zod";

export const CARD_QUALITY_DEFAULT_DAYS = 30;
export const CARD_QUALITY_MAX_DAYS = 365;
export const CARD_QUALITY_UNKNOWN_MODEL = "unknown";

// GET /card-quality/models
export const cardQualityQuery = z.object({
  days: z.coerce.number().int().min(1).max(CARD_QUALITY_MAX_DAYS).optional(),
});

export type CardQualityQuery = z.output<typeof cardQualityQuery>;

export const cardQualityModelRow = z.object({
  modelId: z.string(),
  approved: z.number().int(),
  rejected: z.number().int(),
  chat: z.number().int(),
  pending: z.number().int(),
  superseded: z.number().int(),
  approvalRate: z.number().nullable(),
  averageRating: z.number().nullable(),
  topReasons: z.array(z.object({ reasonCode: z.string(), count: z.number().int() })),
});

export type CardQualityModelRow = z.infer<typeof cardQualityModelRow>;

export const cardQualityByModelResponse = z.object({
  models: z.array(cardQualityModelRow),
});

export type CardQualityByModelResponse = z.infer<typeof cardQualityByModelResponse>;
