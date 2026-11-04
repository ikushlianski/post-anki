import type http from "node:http";
import { reviewCardsQuerySchema } from "@post-anki/shared";
import { sendJson, sendInvalidQuery } from "../shared/http.js";
import { getSubjectReviewDueCounts } from "./subject-review-due-counts.repo.js";

const subjectDueCountsQuerySchema = reviewCardsQuerySchema.pick({ tz: true });

export async function handleListSubjectReviewDueCounts(
  res: http.ServerResponse,
  search: string,
): Promise<void> {
  const parsed = subjectDueCountsQuerySchema.safeParse(Object.fromEntries(new URLSearchParams(search)));

  if (!parsed.success) {
    sendInvalidQuery(res, parsed.error);
    return;
  }

  sendJson(
    res,
    200,
    await getSubjectReviewDueCounts({ tz: parsed.data.tz, now: new Date() }),
  );
}
