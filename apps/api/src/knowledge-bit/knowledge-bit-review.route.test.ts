import type { AddressInfo } from "node:net";
import type http from "node:http";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { KnowledgeBitReviewQueue } from "./knowledge-bit-review-queue.repo.js";
import type { RecordKnowledgeBitReviewOutcome } from "./knowledge-bit-review.orchestrator.js";
import type { UpdateScheduleControlsOutcome } from "./knowledge-bit-review-suspension.orchestrator.js";
import type { UndoKnowledgeBitReviewOutcome } from "./knowledge-bit-review-undo.orchestrator.js";

process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/db";
process.env.OPENROUTER_API_KEY ??= "test-key";
process.env.API_SHARED_SECRET = "the-shared-secret";

function emptyQueue(): KnowledgeBitReviewQueue {
  return { cards: [], counts: { new: 0, learning: 0, review: 0 }, newRemainingToday: 20, newLimitReached: false, nextDueAt: null };
}

const state = vi.hoisted(() => ({
  queue: emptyQueue(),
  outcome: null as RecordKnowledgeBitReviewOutcome | null,
  undo: null as UndoKnowledgeBitReviewOutcome | null,
  controls: null as UpdateScheduleControlsOutcome | null,
}));

vi.mock("./knowledge-bit-review-queue.repo.js", () => ({
  getKnowledgeBitReviewQueue: vi.fn(async () => state.queue),
}));

vi.mock("./knowledge-bit-review.orchestrator.js", () => ({
  recordKnowledgeBitReview: vi.fn(async () => state.outcome),
}));

vi.mock("./knowledge-bit-review-undo.orchestrator.js", () => ({
  undoKnowledgeBitReview: vi.fn(async () => state.undo),
}));

vi.mock("./knowledge-bit-review-suspension.orchestrator.js", () => ({
  updateKnowledgeBitScheduleControls: vi.fn(async () => state.controls),
}));

const { createApiServer } = await import("../api-server.js");
const { getKnowledgeBitReviewQueue } = await import("./knowledge-bit-review-queue.repo.js");
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
  state.queue = emptyQueue();
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
  it("should hand the learner each card's reference answer, interval previews and the queue counts but never the bit's own text", async () => {
    state.queue = {
      cards: [
        {
          variantId: "kbqv_1",
          knowledgeBitId: "kb_1",
          kind: "wh_question",
          prompt: "Why does TCP use a handshake?",
          answer: "To agree on sequence numbers before sending data.",
          background: null,
          isAiGenerated: false,
          sourceLinks: [],
          subjectId: null,
          phase: "new",
          leech: false,
          intervalPreview: { again: 86_400, hard: 86_400, good: 86_400, easy: 345_600 },
        },
      ],
      counts: { new: 3, learning: 0, review: 2 },
      newRemainingToday: 17,
      newLimitReached: false,
      nextDueAt: "2026-10-11T12:00:00.000Z",
    };

    const response = await fetch(`${baseUrl}/knowledge-bits/review-cards`, { headers: AUTH });
    const body = (await response.json()) as { cards: Record<string, unknown>[] } & Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body.cards[0]?.answer).toBe("To agree on sequence numbers before sending data.");
    expect(body.cards[0]?.intervalPreview).toEqual({ again: 86_400, hard: 86_400, good: 86_400, easy: 345_600 });
    expect(body.cards[0]?.isAiGenerated).toBe(false);
    expect(body.cards[0]?.sourceLinks).toEqual([]);
    expect(body.cards[0]).not.toHaveProperty("bitBody");
    expect(body.counts).toEqual({ new: 3, learning: 0, review: 2 });
    expect(body.newRemainingToday).toBe(17);
    expect(body.nextDueAt).toBe("2026-10-11T12:00:00.000Z");
    expect(vi.mocked(getKnowledgeBitReviewQueue)).toHaveBeenCalledWith(
      10,
      { tagId: undefined, topicId: undefined, knowledgeBitId: undefined },
      { tz: "UTC", now: expect.any(Date) },
    );
  });

  it("should keep the learner's tag scope when loading cards", async () => {
    await fetch(`${baseUrl}/knowledge-bits/review-cards?limit=5&tagId=tag_1`, { headers: AUTH });

    expect(vi.mocked(getKnowledgeBitReviewQueue)).toHaveBeenCalledWith(
      5,
      { tagId: "tag_1", topicId: undefined, knowledgeBitId: undefined },
      { tz: "UTC", now: expect.any(Date) },
    );
  });

  it("should count the new-card day in the learner's own time zone", async () => {
    await fetch(`${baseUrl}/knowledge-bits/review-cards?tz=Pacific/Auckland`, { headers: AUTH });

    expect(vi.mocked(getKnowledgeBitReviewQueue).mock.calls[0]?.[2].tz).toBe("Pacific/Auckland");
  });

  it("should refuse an unknown time zone instead of guessing the learner's day", async () => {
    const response = await fetch(`${baseUrl}/knowledge-bits/review-cards?tz=Mars/Olympus`, {
      headers: AUTH,
    });

    expect(response.status).toBe(400);
    expect(vi.mocked(getKnowledgeBitReviewQueue)).not.toHaveBeenCalled();
  });

  it("should refuse an out-of-range batch size instead of silently clamping it", async () => {
    const response = await fetch(`${baseUrl}/knowledge-bits/review-cards?limit=500`, {
      headers: AUTH,
    });

    expect(response.status).toBe(400);
    expect(vi.mocked(getKnowledgeBitReviewQueue)).not.toHaveBeenCalled();
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
      lapses: 0,
      leech: false,
      suspended: false,
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
      lapses: 0,
      leech: false,
      suspended: false,
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

describe("DELETE /knowledge-bits/reviews/:id", () => {
  const undo = (headers: Record<string, string> = AUTH) =>
    fetch(`${baseUrl}/knowledge-bits/reviews/kbreview_1`, { method: "DELETE", headers });

  it("should take a grade back and name the card it belonged to", async () => {
    state.undo = { ok: true, knowledgeBitId: "kb_1" };

    const response = await undo();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ knowledgeBitId: "kb_1" });
  });

  it("should refuse with 409 when the card was reviewed again since", async () => {
    state.undo = { ok: false, error: "not_latest" };

    expect((await undo()).status).toBe(409);
  });

  it("should report an unknown review as not found", async () => {
    state.undo = { ok: false, error: "review_not_found" };

    expect((await undo()).status).toBe(404);
  });

  it("should not undo for a caller without the shared secret", async () => {
    expect((await undo({})).status).toBe(401);
  });
});

describe("PATCH /knowledge-bits/:id/schedule", () => {
  const patch = (body: unknown, headers: Record<string, string> = AUTH) =>
    fetch(`${baseUrl}/knowledge-bits/kb_1/schedule`, {
      method: "PATCH",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  it("should suspend a card and report its state", async () => {
    state.controls = {
      ok: true,
      knowledgeBitId: "kb_1",
      suspended: true,
      buriedUntil: null,
      leech: false,
    };

    const response = await patch({ suspended: true });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      knowledgeBitId: "kb_1",
      suspended: true,
      buriedUntil: null,
      leech: false,
    });
  });

  it("should reject a body that neither suspends nor buries", async () => {
    expect((await patch({})).status).toBe(400);
  });

  it("should refuse a bit that is not approved", async () => {
    state.controls = { ok: false, error: "not_approved" };

    expect((await patch({ buried: true })).status).toBe(403);
  });

  it("should report a missing bit as not found", async () => {
    state.controls = { ok: false, error: "not_found" };

    expect((await patch({ buried: true })).status).toBe(404);
  });

  it("should not change a card for a caller without the shared secret", async () => {
    expect((await patch({ suspended: true }, {})).status).toBe(401);
  });
});
