import type http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getTopicRow = vi.hoisted(() => vi.fn());
const startCardsManually = vi.hoisted(() => vi.fn());
const getCardsByTopic = vi.hoisted(() => vi.fn());
const findTopMatchingCards = vi.hoisted(() => vi.fn());
const triggerCardEmbeddingScan = vi.hoisted(() => vi.fn());
const embedFacts = vi.hoisted(() => vi.fn());

vi.mock("../topic/topic-progress.repo.js", () => ({ getTopicRow }));
vi.mock("./cards.orchestrator.js", () => ({ startCardsManually }));
vi.mock("./cards-embedding.orchestrator.js", () => ({ triggerCardEmbeddingScan }));
vi.mock("../facts/facts-embedding.orchestrator.js", () => ({ embedFacts }));
vi.mock("./cards-retrieval.orchestrator.js", () => ({ findTopMatchingCards }));
vi.mock("./cards.repo.js", () => ({ getCardsByTopic, getCurriculumCardsSummary: vi.fn() }));
vi.mock("./list-cards-for-curriculum.repo.js", () => ({ listCardsForCurriculum: vi.fn() }));
vi.mock("../shared/log.js", () => ({ log: { error: vi.fn() } }));

import {
  handleCompileCards,
  handleFindTopMatchingCards,
  handleGetCards,
  handleTriggerCardEmbeddingScan,
} from "./cards.controller.js";

function fakeRes() {
  const res = { writeHead: vi.fn(), end: vi.fn() };

  return res as unknown as http.ServerResponse & typeof res;
}

function sent(res: ReturnType<typeof fakeRes>): { status: number; body: unknown } {
  return {
    status: vi.mocked(res.writeHead).mock.calls[0]![0] as number,
    body: JSON.parse(vi.mocked(res.end).mock.calls[0]![0] as string),
  };
}

beforeEach(() => {
  getTopicRow.mockReset();
  startCardsManually.mockReset();
  getCardsByTopic.mockReset();
  findTopMatchingCards.mockReset();
  triggerCardEmbeddingScan.mockReset();
  embedFacts.mockReset();
});

describe("handleCompileCards", () => {
  it("should answer 404 for an unknown topic", async () => {
    getTopicRow.mockResolvedValue(null);
    const res = fakeRes();

    await handleCompileCards(res, "nope");

    expect(sent(res)).toEqual({ status: 404, body: { error: "not_found" } });
    expect(startCardsManually).not.toHaveBeenCalled();
  });

  it("should answer 202 when generation starts", async () => {
    getTopicRow.mockResolvedValue({ id: "t1" });
    startCardsManually.mockResolvedValue({ cardSet: { status: "generating" }, alreadyInProgress: false });
    const res = fakeRes();

    await handleCompileCards(res, "t1");

    expect(sent(res).status).toBe(202);
  });

  it("should answer 200 and not start twice when generation is already running", async () => {
    getTopicRow.mockResolvedValue({ id: "t1" });
    startCardsManually.mockResolvedValue({ cardSet: { status: "generating" }, alreadyInProgress: true });
    const res = fakeRes();

    await handleCompileCards(res, "t1");

    expect(sent(res).status).toBe(200);
  });
});

describe("handleGetCards", () => {
  it("should answer 404 when the topic has no card set", async () => {
    getCardsByTopic.mockResolvedValue(null);
    const res = fakeRes();

    await handleGetCards(res, "t1");

    expect(sent(res).status).toBe(404);
  });

  it("should return the card set", async () => {
    getCardsByTopic.mockResolvedValue({ cards: [] });
    const res = fakeRes();

    await handleGetCards(res, "t1");

    expect(sent(res)).toEqual({ status: 200, body: { cards: [] } });
  });
});

describe("handleTriggerCardEmbeddingScan", () => {
  it("should answer 502 with a generic message when the scan fails", async () => {
    triggerCardEmbeddingScan.mockRejectedValue(new Error("embedding service down"));
    const res = fakeRes();

    await handleTriggerCardEmbeddingScan(res);

    expect(sent(res)).toEqual({ status: 502, body: { error: "scan_failed", message: "An upstream service failed. Try again shortly." } });
  });

  it("should combine card and fact counts on success", async () => {
    triggerCardEmbeddingScan.mockResolvedValue({ embedded: 2 });
    embedFacts.mockResolvedValue({ embedded: 1 });
    const res = fakeRes();

    await handleTriggerCardEmbeddingScan(res);

    expect(sent(res)).toEqual({ status: 200, body: { embedded: 2, facts: { embedded: 1 } } });
  });
});

describe("handleFindTopMatchingCards", () => {
  it("should answer an empty list for a blank query without searching", async () => {
    const res = fakeRes();

    await handleFindTopMatchingCards(res, "   ", null);

    expect(sent(res)).toEqual({ status: 200, body: [] });
    expect(findTopMatchingCards).not.toHaveBeenCalled();
  });

  it("should cap the limit at 50 and default it to 10", async () => {
    findTopMatchingCards.mockResolvedValue([]);

    await handleFindTopMatchingCards(fakeRes(), "lambda", "999");
    await handleFindTopMatchingCards(fakeRes(), "lambda", "abc");

    expect(findTopMatchingCards.mock.calls[0]![1]).toBe(50);
    expect(findTopMatchingCards.mock.calls[1]![1]).toBe(10);
  });
});
