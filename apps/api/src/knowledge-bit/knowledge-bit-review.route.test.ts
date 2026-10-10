import type { AddressInfo } from "node:net";
import type http from "node:http";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { KnowledgeBitReviewCardRow } from "./knowledge-bit-review-queue.repo.js";
import type { RecordKnowledgeBitReviewOutcome } from "./knowledge-bit-review.orchestrator.js";

process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/db";
process.env.OPENROUTER_API_KEY ??= "test-key";
process.env.API_SHARED_SECRET = "the-shared-secret";

const state = vi.hoisted(() => ({
  cards: [] as KnowledgeBitReviewCardRow[],
  outcome: null as RecordKnowledgeBitReviewOutcome | null,
}));

vi.mock("./knowledge-bit-review-queue.repo.js", () => ({
  listKnowledgeBitReviewCards: vi.fn(async () => state.cards),
}));

vi.mock("./knowledge-bit-review.orchestrator.js", () => ({
  recordKnowledgeBitReview: vi.fn(async () => state.outcome),
}));

const { createApiServer } = await import("../api-server.js");
const { listKnowledgeBitReviewCards } = await import("./knowledge-bit-review-queue.repo.js");
const { recordKnowledgeBitReview } = await import("./knowledge-bit-review.orchestrator.js");

const AUTH = { authorization: `Bearer ${process.env.API_SHARED_SECRET}` };

let server: http.Server;
let baseUrl: string;

beforeAll(async () => {
  server = createApiServer();

  await new Promise<void>((resolve) => {
    server.listen(0, resolve);
  });

  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

afterEach(() => {
  state.cards = [];
  state.outcome = null;
  vi.clearAllMocks();
});

function postReview(body: unknown, headers: Record<string, string> = AUTH) {
  return fetch(`${baseUrl}/knowledge-bits/reviews`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /knowledge-bits/review-cards", () => {
  it("should hand the learner each card's reference answer but never the bit's own text", async () => {
    state.cards = [
      {
        variantId: "kbqv_1",
        knowledgeBitId: "kb_1",
        kind: "wh_question",
        prompt: "Why does TCP use a handshake?",
        answer: "To agree on sequence numbers before sending data.",
        background: null,
        phase: "new",
      },
    ];

    const response = await fetch(`${baseUrl}/knowledge-bits/review-cards`, { headers: AUTH });
    const body = (await response.json()) as { cards: Record<string, unknown>[] };

    expect(response.status).toBe(200);
    expect(body.cards[0]?.answer).toBe("To agree on sequence numbers before sending data.");
    expect(body.cards[0]).not.toHaveProperty("bitBody");
    expect(vi.mocked(listKnowledgeBitReviewCards)).toHaveBeenCalledWith(10, {
      tagId: undefined,
      topicId: undefined,
      knowledgeBitId: undefined,
    });
  });

  it("should keep the learner's tag scope when loading cards", async () => {
    await fetch(`${baseUrl}/knowledge-bits/review-cards?limit=5&tagId=tag_1`, { headers: AUTH });

    expect(vi.mocked(listKnowledgeBitReviewCards)).toHaveBeenCalledWith(5, {
      tagId: "tag_1",
      topicId: undefined,
      knowledgeBitId: undefined,
    });
  });

  it("should refuse an out-of-range batch size instead of silently clamping it", async () => {
    const response = await fetch(`${baseUrl}/knowledge-bits/review-cards?limit=500`, {
      headers: AUTH,
    });

    expect(response.status).toBe(400);
    expect(vi.mocked(listKnowledgeBitReviewCards)).not.toHaveBeenCalled();
  });

  it("should not serve cards to a caller without the shared secret", async () => {
    const response = await fetch(`${baseUrl}/knowledge-bits/review-cards`);

    expect(response.status).toBe(401);
  });
});

describe("POST /knowledge-bits/reviews", () => {
  it("should save a self-grade and return when the card comes back", async () => {
    state.outcome = {
      ok: true,
      reviewId: "kbreview_1",
      knowledgeBitId: "kb_1",
      phase: "review",
      dueAt: "2026-10-11T12:00:00.000Z",
      intervalDays: 1,
    };

    const response = await postReview({ variantId: "kbqv_1", grade: "good", durationMs: 4200 });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual({
      reviewId: "kbreview_1",
      knowledgeBitId: "kb_1",
      phase: "review",
      dueAt: "2026-10-11T12:00:00.000Z",
      intervalDays: 1,
    });
  });

  it("should reject a grade outside Again, Hard, Good and Easy without saving anything", async () => {
    const response = await postReview({ variantId: "kbqv_1", grade: "perfect" });

    expect(response.status).toBe(400);
    expect(vi.mocked(recordKnowledgeBitReview)).not.toHaveBeenCalled();
  });

  it("should refuse to grade a card whose bit is not approved", async () => {
    state.outcome = { ok: false, error: "not_approved" };

    const response = await postReview({ variantId: "kbqv_1", grade: "good" });

    expect(response.status).toBe(403);
  });

  it("should report a card that no longer exists as not found", async () => {
    state.outcome = { ok: false, error: "variant_not_found" };

    const response = await postReview({ variantId: "kbqv_missing", grade: "again" });

    expect(response.status).toBe(404);
  });

  it("should not accept grades from a caller without the shared secret", async () => {
    const response = await postReview({ variantId: "kbqv_1", grade: "good" }, {});

    expect(response.status).toBe(401);
    expect(vi.mocked(recordKnowledgeBitReview)).not.toHaveBeenCalled();
  });
});
