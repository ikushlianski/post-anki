import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeRes } from "../shared/fake-http.test-mocks.js";

const gatherPushCandidates = vi.fn();
const gatherNudgeCandidates = vi.fn();
const buildProbeQuestionForGap = vi.fn();
const selectRotatingDailyPush = vi.fn();
const selectDueQueue = vi.fn();
const selectNudge = vi.fn();

vi.mock("./push.repo.js", () => ({
  gatherPushCandidates: (...args: unknown[]) => gatherPushCandidates(...args),
}));

vi.mock("../liveness/nudge.repo.js", () => ({
  gatherNudgeCandidates: (...args: unknown[]) => gatherNudgeCandidates(...args),
}));

vi.mock("../probe/probe.service.js", () => ({
  buildProbeQuestionForGap: (...args: unknown[]) => buildProbeQuestionForGap(...args),
}));

vi.mock("@post-anki/core", () => ({
  selectRotatingDailyPush: (...args: unknown[]) => selectRotatingDailyPush(...args),
  selectDueQueue: (...args: unknown[]) => selectDueQueue(...args),
  selectNudge: (...args: unknown[]) => selectNudge(...args),
}));

const { handleDailyPush, handleDueQueue } = await import("./push.controller.js");

const pick = { topicId: "t1", gap: { id: "g1" } };

describe("daily push", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gatherPushCandidates.mockResolvedValue([]);
    gatherNudgeCandidates.mockResolvedValue([]);
    selectNudge.mockReturnValue(null);
    buildProbeQuestionForGap.mockResolvedValue({ id: "q1" });
  });

  it("should answer 200 with no push, question or nudge when nothing is due", async () => {
    selectRotatingDailyPush.mockReturnValue(null);
    const res = fakeRes();

    await handleDailyPush(res, null);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ push: null, question: null, nudge: null });
    expect(buildProbeQuestionForGap).not.toHaveBeenCalled();
  });

  it.each([[null], ["bogus"], [""]])(
    "should fall back to socratic questions when the mode is %j",
    async (mode) => {
      selectRotatingDailyPush.mockReturnValue(pick);

      await handleDailyPush(fakeRes(), mode);

      expect(buildProbeQuestionForGap).toHaveBeenCalledWith("t1", pick.gap, "socratic");
    },
  );

  it("should build a quick test question when that mode is asked for", async () => {
    selectRotatingDailyPush.mockReturnValue(pick);

    await handleDailyPush(fakeRes(), "quick_test");

    expect(buildProbeQuestionForGap).toHaveBeenCalledWith("t1", pick.gap, "quick_test");
  });

  it("should restrict candidates to the requested subject", async () => {
    selectRotatingDailyPush.mockReturnValue(null);

    await handleDailyPush(fakeRes(), null, "s1");

    expect(gatherPushCandidates).toHaveBeenCalledWith("s1");
  });

  it("should not restrict candidates when no subject is given", async () => {
    selectRotatingDailyPush.mockReturnValue(null);

    await handleDailyPush(fakeRes(), null, null);

    expect(gatherPushCandidates).toHaveBeenCalledWith(undefined);
  });

  it("should return the pick, its question and a nudge with related subjects", async () => {
    selectRotatingDailyPush.mockReturnValue(pick);
    selectNudge.mockReturnValue({
      target: { entityType: "topic", entityId: "e1", name: "A", score: 3, extra: "x" },
      related: [{ entityType: "topic", entityId: "e2", name: "B", score: 1, extra: "y" }],
    });
    const res = fakeRes();

    await handleDailyPush(res, "socratic");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      push: pick,
      question: { id: "q1" },
      nudge: {
        entityType: "topic",
        entityId: "e1",
        name: "A",
        score: 3,
        related: [{ entityType: "topic", entityId: "e2", name: "B", score: 1 }],
      },
    });
  });
});

describe("due queue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should answer 200 with an empty list when nothing is due", async () => {
    gatherPushCandidates.mockResolvedValue([]);
    selectDueQueue.mockReturnValue([]);
    const res = fakeRes();

    await handleDueQueue(res);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [] });
  });

  it("should answer 200 with every due item across subjects", async () => {
    const candidates = [{ subjectId: "s1" }];

    gatherPushCandidates.mockResolvedValue(candidates);
    selectDueQueue.mockReturnValue([{ topicId: "t1" }, { topicId: "t2" }]);
    const res = fakeRes();

    await handleDueQueue(res);

    expect(res.body).toEqual({ items: [{ topicId: "t1" }, { topicId: "t2" }] });
    expect(selectDueQueue).toHaveBeenCalledWith(candidates, expect.any(String));
    expect(gatherPushCandidates).toHaveBeenCalledWith();
  });
});
