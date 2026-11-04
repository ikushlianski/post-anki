import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeReq, fakeRes } from "../shared/fake-http.test-mocks.js";

const resolveProbeQuestionItem = vi.fn();
const resolveSocraticTurnItem = vi.fn();
const upsertItemFeedback = vi.fn();

vi.mock("../shared/study-item.js", () => ({
  resolveProbeQuestionItem: (...args: unknown[]) => resolveProbeQuestionItem(...args),
  resolveSocraticTurnItem: (...args: unknown[]) => resolveSocraticTurnItem(...args),
}));

vi.mock("./feedback.repo.js", () => ({
  upsertItemFeedback: (...args: unknown[]) => upsertItemFeedback(...args),
}));

const { handleSubmitProbeQuestionFeedback, handleSubmitSocraticTurnFeedback } = await import(
  "./feedback.controller.js"
);

const cases = [
  { name: "probe question", itemType: "probe_question", handler: handleSubmitProbeQuestionFeedback, resolver: resolveProbeQuestionItem, other: resolveSocraticTurnItem },
  { name: "socratic turn", itemType: "socratic_turn", handler: handleSubmitSocraticTurnFeedback, resolver: resolveSocraticTurnItem, other: resolveProbeQuestionItem },
] as const;

describe.each(cases)("submit feedback on a $name", ({ itemType, handler, resolver, other }) => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should answer 400 and save nothing when the rating is not up or down", async () => {
    const res = fakeRes();

    await handler(fakeReq(JSON.stringify({ rating: "meh" })), res, "i1");

    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe("invalid_input");
    expect(upsertItemFeedback).not.toHaveBeenCalled();
  });

  it("should answer 400 when the body is not valid JSON", async () => {
    const res = fakeRes();

    await handler(fakeReq("{nope"), res, "i1");

    expect(res.status).toBe(400);
    expect(upsertItemFeedback).not.toHaveBeenCalled();
  });

  it("should answer 404 and save nothing when the item does not exist", async () => {
    resolver.mockResolvedValue(null);
    const res = fakeRes();

    await handler(fakeReq(JSON.stringify({ rating: "up" })), res, "missing");

    expect(res.status).toBe(404);
    expect(upsertItemFeedback).not.toHaveBeenCalled();
  });

  it("should save the rating against the matching item kind and answer 200", async () => {
    resolver.mockResolvedValue({ topicId: "t1", itemText: "What is X?" });
    upsertItemFeedback.mockResolvedValue({ id: "f1", rating: "down" });
    const res = fakeRes();

    await handler(fakeReq(JSON.stringify({ rating: "down", comment: "unclear" })), res, "i1");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: "f1", rating: "down" });
    expect(other).not.toHaveBeenCalled();
    expect(upsertItemFeedback).toHaveBeenCalledWith({
      itemType,
      itemId: "i1",
      topicId: "t1",
      itemText: "What is X?",
      rating: "down",
      comment: "unclear",
    });
  });

  it("should store a null comment when none is given", async () => {
    resolver.mockResolvedValue({ topicId: null, itemText: "Q" });
    upsertItemFeedback.mockResolvedValue({ id: "f2" });

    await handler(fakeReq(JSON.stringify({ rating: "up" })), fakeRes(), "i2");

    expect(upsertItemFeedback).toHaveBeenCalledWith(expect.objectContaining({ comment: null }));
  });
});
