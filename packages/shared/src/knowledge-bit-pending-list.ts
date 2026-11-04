import { z } from "zod";

// GET /knowledge-bits/pending-review?includeTotal=1 (without it the response stays a bare array)
export const pendingReviewTotalSchema = z.number().int().min(0);

export const pendingReviewListWithTotalResponse = z.object({
  items: z.array(z.unknown()),
  total: pendingReviewTotalSchema,
});

export interface PendingReviewListWithTotal<T> {
  items: T[];
  total: number;
}

// GET /knowledge-bits/pending-review?afterCreatedAt=...&afterId=... (keyset page after the last card seen)
export const pendingReviewCursorSchema = z
  .object({
    afterCreatedAt: z.string().datetime().optional(),
    afterId: z.string().min(1).optional(),
  })
  .refine((cursor) => (cursor.afterCreatedAt === undefined) === (cursor.afterId === undefined), {
    message: "afterCreatedAt and afterId must be sent together",
  });

export type PendingReviewCursor = { afterCreatedAt: string; afterId: string };
