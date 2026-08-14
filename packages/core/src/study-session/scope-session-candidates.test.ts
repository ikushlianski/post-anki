import { describe, it, expect } from "vitest";
import type { Gap } from "@post-anki/shared";
import type { PushCandidate } from "../curriculum/daily-push";
import { scopeSessionCandidates } from "./scope-session-candidates";

function gap(overrides: Partial<Gap> & { id: string }): Gap {
  return {
    topicId: "t",
    label: "g",
    depth: "working",
    origin: "ai",
    state: "open",
    wanted: false,
    concern: null,
    lastEvaluatedAt: null,
    triageState: "untriaged",
    triagedAt: null,
    deferredUntil: null,
    deferralCount: 0,
    dismissedAt: null,
    dismissedCheckinSentAt: null,
    untriagedSince: "2020-01-01T00:00:00.000Z",
    autoDeferredAt: null,
    ...overrides,
  };
}

function candidate(overrides: Partial<PushCandidate> & { topicId: string; curriculumId: string }): PushCandidate {
  return {
    topicTitle: "T",
    curriculumName: "C",
    depth: "working",
    gaps: [],
    ...overrides,
  };
}

describe("scopeSessionCandidates", () => {
  it("passes every candidate through unscoped when the session targets 'anything'", () => {
    const candidates = [
      candidate({ topicId: "a", curriculumId: "c1", gaps: [gap({ id: "g1" })] }),
      candidate({ topicId: "b", curriculumId: "c2", gaps: [gap({ id: "g2" })] }),
    ];

    const scoped = scopeSessionCandidates(candidates, null, []);

    expect(scoped).toEqual(candidates);
  });

  it("keeps only candidates whose curriculum is in the session's scoped set", () => {
    const candidates = [
      candidate({ topicId: "a", curriculumId: "c1", gaps: [gap({ id: "g1" })] }),
      candidate({ topicId: "b", curriculumId: "c2", gaps: [gap({ id: "g2" })] }),
    ];

    const scoped = scopeSessionCandidates(candidates, ["c1"], []);

    expect(scoped.map((c) => c.topicId)).toEqual(["a"]);
  });

  it("excludes a gap already covered this session while leaving the topic's other gaps eligible", () => {
    const candidates = [
      candidate({
        topicId: "a",
        curriculumId: "c1",
        gaps: [gap({ id: "covered" }), gap({ id: "still-open" })],
      }),
    ];

    const scoped = scopeSessionCandidates(candidates, null, ["covered"]);

    expect(scoped[0]?.gaps.map((g) => g.id)).toEqual(["still-open"]);
  });

  it("returns a candidate with no remaining gaps rather than dropping it, leaving selectDailyPush to skip it naturally", () => {
    const candidates = [
      candidate({ topicId: "a", curriculumId: "c1", gaps: [gap({ id: "g1" })] }),
    ];

    const scoped = scopeSessionCandidates(candidates, null, ["g1"]);

    expect(scoped).toHaveLength(1);
    expect(scoped[0]?.gaps).toEqual([]);
  });
});
