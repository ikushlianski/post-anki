import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  editKnowledgeBitQuestionVariantInput,
  recordReviewInputSchema,
  recordReviewResultSchema,
  reviewCardsQuerySchema,
  reviewCardsResponseSchema,
  scheduleControlInputSchema,
  scheduleControlResultSchema,
  undoReviewResultSchema,
} from "@post-anki/shared";
import type {
  RecordReviewInput,
  RecordReviewResult,
  ReviewCardsQuery,
  ReviewCardsResponse,
  ScheduleControlResult,
  UndoReviewResult,
} from "@post-anki/shared";

import { ApiError, request } from "../curriculum/api-client";

export type ReviewCardsOutcome =
  | ({ ok: true } & ReviewCardsResponse)
  | { ok: false; error: string };

export type SubmitReviewOutcome =
  | ({ ok: true } & RecordReviewResult)
  | { ok: false; error: string };

function toFailure(err: unknown): { ok: false; error: string } {
  if (err instanceof ApiError) {
    return { ok: false, error: err.code ?? "unknown" };
  }

  return { ok: false, error: err instanceof Error ? err.message : "unknown" };
}

export const getReviewCards = createServerFn({ method: "GET" })
  .inputValidator((data: Partial<ReviewCardsQuery>) =>
    reviewCardsQuerySchema.parse(data),
  )
  .handler(async ({ data }): Promise<ReviewCardsOutcome> => {
    const params = new URLSearchParams({
      limit: String(data.limit),
      tz: data.tz,
      aheadDays: String(data.aheadDays),
    });

    for (const key of [
      "tagId",
      "topicId",
      "knowledgeBitId",
      "subjectId",
    ] as const) {
      const value = data[key];

      if (value) {
        params.set(key, value);
      }
    }

    try {
      const body = await request<unknown>(
        `/knowledge-bits/review-cards?${params.toString()}`,
      );

      return { ok: true, ...reviewCardsResponseSchema.parse(body) };
    } catch (err) {
      return toFailure(err);
    }
  });

export const submitReview = createServerFn({ method: "POST" })
  .inputValidator((data: RecordReviewInput) =>
    recordReviewInputSchema.parse(data),
  )
  .handler(async ({ data }): Promise<SubmitReviewOutcome> => {
    try {
      const body = await request<unknown>("/knowledge-bits/reviews", {
        method: "POST",
        body: data,
      });

      return { ok: true, ...recordReviewResultSchema.parse(body) };
    } catch (err) {
      return toFailure(err);
    }
  });

export type UndoReviewOutcome =
  | ({ ok: true } & UndoReviewResult)
  | { ok: false; error: string };

export type UpdateCardScheduleOutcome =
  | ({ ok: true } & ScheduleControlResult)
  | { ok: false; error: string };

export type EditReviewCardOutcome =
  | {
      ok: true;
      variantId: string;
      prompt?: string | null;
      answer?: string | null;
    }
  | { ok: false; error: string; message?: string };

const reviewIdSchema = z.object({ reviewId: z.string().min(1) });
const editReviewCardInputSchema = z
  .object({ variantId: z.string().min(1) })
  .and(editKnowledgeBitQuestionVariantInput);
const updateCardScheduleInputSchema = scheduleControlInputSchema.and(
  z.object({ knowledgeBitId: z.string().min(1) }),
);

export const undoReview = createServerFn({ method: "POST" })
  .inputValidator((data: { reviewId: string }) => reviewIdSchema.parse(data))
  .handler(async ({ data }): Promise<UndoReviewOutcome> => {
    try {
      const body = await request<unknown>(
        `/knowledge-bits/reviews/${data.reviewId}`,
        {
          method: "DELETE",
        },
      );

      return { ok: true, ...undoReviewResultSchema.parse(body) };
    } catch (err) {
      return toFailure(err);
    }
  });

export const updateCardSchedule = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      knowledgeBitId: string;
      variantId?: string;
      suspended?: boolean;
      buried?: boolean;
      tz?: string;
    }) => updateCardScheduleInputSchema.parse(data),
  )
  .handler(async ({ data }): Promise<UpdateCardScheduleOutcome> => {
    const { knowledgeBitId, ...controls } = data;

    try {
      const body = await request<unknown>(
        `/knowledge-bits/${knowledgeBitId}/schedule`,
        {
          method: "PATCH",
          body: controls,
        },
      );

      return { ok: true, ...scheduleControlResultSchema.parse(body) };
    } catch (err) {
      return toFailure(err);
    }
  });

export const editReviewCard = createServerFn({ method: "POST" })
  .inputValidator(
    (
      data:
        | {
            variantId: string;
            prompt: string;
            answer: string;
            context?: string | null;
          }
        | { variantId: string; note: string }
        | { variantId: string; list: string },
    ) => editReviewCardInputSchema.parse(data),
  )
  .handler(async ({ data }): Promise<EditReviewCardOutcome> => {
    const { variantId, ...text } = data;

    try {
      const body = await request<{
        variantId: string;
        cards?: { id: string; prompt: string; answer: string }[];
      }>(`/knowledge-bits/question-variants/${variantId}`, {
        method: "PATCH",
        body: text,
      });
      const edited = body.cards?.find((card) => card.id === body.variantId);

      return {
        ok: true,
        variantId: body.variantId,
        prompt: edited?.prompt ?? null,
        answer: edited?.answer ?? null,
      };
    } catch (err) {
      if (
        err instanceof ApiError &&
        (err.code === "invalid_note" || err.code === "invalid_list")
      ) {
        const detail = err.details as { message?: string } | undefined;

        return { ok: false, error: err.code, message: detail?.message };
      }

      return toFailure(err);
    }
  });
