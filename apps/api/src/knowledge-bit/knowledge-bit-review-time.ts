const MAX_AGE_MS = 14 * 86_400_000;

export interface ReviewTimeInput {
  reviewedAt?: string;
  sentAt?: string;
}

export type ReviewTimeResult =
  | { ok: true; reviewedAt: Date }
  | { ok: false; error: "review_time_out_of_range" };

// reviewedAt is the phone's clock; sentAt lets the server remove the phone's clock skew.
export function resolveReviewedAt(input: ReviewTimeInput, now: Date): ReviewTimeResult {
  if (!input.reviewedAt) {
    return { ok: true, reviewedAt: now };
  }

  const skewMs = input.sentAt ? now.getTime() - new Date(input.sentAt).getTime() : 0;
  const shifted = new Date(input.reviewedAt).getTime() + skewMs;

  if (now.getTime() - shifted > MAX_AGE_MS) {
    return { ok: false, error: "review_time_out_of_range" };
  }

  return { ok: true, reviewedAt: new Date(Math.min(shifted, now.getTime())) };
}
