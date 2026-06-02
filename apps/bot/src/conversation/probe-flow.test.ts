import { describe, it, expect, vi } from "vitest";
import {
  answerPending,
  formatQuestion,
  formatResult,
  sendTodaysQuestion,
  NO_PUSH_REPLY,
  NO_PENDING_REPLY,
  type FlowDeps,
} from "./probe-flow.js";

const QUESTION = {
  gapId: "g1",
  gapLabel: "idempotency keys",
  kind: "socratic" as const,
  prompt: "When do you reach for an idempotency key?",
};

function deps(over: Partial<FlowDeps> = {}): FlowDeps {
  return {
    getDailyPush: vi.fn().mockResolvedValue({
      push: { topicId: "t1", topicTitle: "Idempotency", curriculumId: "c1", curriculumName: "Backend", gap: { id: "g1" }, reason: "weakest" },
      question: QUESTION,
    }),
    submitAnswer: vi.fn().mockResolvedValue({
      outcome: "pass",
      coveredGapLabels: ["idempotency keys"],
      feedback: "Holds up.",
      progress: { status: "in_progress", maturity: 50, attempts: 1, lastInteractedAt: null },
      learningStatus: "probing",
      nextQuestion: null,
    }),
    getPending: vi.fn().mockResolvedValue({ topicId: "t1", gapId: "g1", mode: "socratic" }),
    setPending: vi.fn().mockResolvedValue(undefined),
    clearPending: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
}

describe("formatQuestion", () => {
  it("shows the gap label and prompt for a socratic question", () => {
    const out = formatQuestion(QUESTION);
    expect(out).toContain("idempotency keys");
    expect(out).toContain("When do you reach");
  });

  it("numbers options for a quick_test", () => {
    const out = formatQuestion({ ...QUESTION, kind: "quick_test", options: ["A", "B", "C"] });
    expect(out).toContain("1. A");
    expect(out).toContain("3. C");
  });

  it("labels an opener when there is no gap", () => {
    expect(formatQuestion({ ...QUESTION, gapId: null, gapLabel: null })).toContain("Opening question");
  });
});

describe("formatResult", () => {
  it("marks a pass and lists covered gaps", () => {
    const out = formatResult({ outcome: "pass", coveredGapLabels: ["a", "b"], feedback: "Good.", progress: { status: "in_progress", maturity: 1, attempts: 1, lastInteractedAt: null }, learningStatus: "probing", nextQuestion: null });
    expect(out).toContain("✅");
    expect(out).toContain("Covered: a, b");
  });
});

describe("sendTodaysQuestion", () => {
  it("sets the pending question and returns the formatted prompt", async () => {
    const d = deps();
    const out = await sendTodaysQuestion(7, "socratic", d);
    expect(d.setPending).toHaveBeenCalledWith(7, { topicId: "t1", gapId: "g1", mode: "socratic" });
    expect(out).toContain("Backend › Idempotency");
    expect(out).toContain("When do you reach");
  });

  it("returns the no-push message when nothing is queued", async () => {
    const d = deps({ getDailyPush: vi.fn().mockResolvedValue({ push: null, question: null }) });
    expect(await sendTodaysQuestion(7, "socratic", d)).toBe(NO_PUSH_REPLY);
  });
});

describe("answerPending", () => {
  it("submits against the pending gap and clears it when no next question", async () => {
    const d = deps();
    const out = await answerPending(7, "my answer", d);
    expect(d.submitAnswer).toHaveBeenCalledWith({ topicId: "t1", gapId: "g1", mode: "socratic", answer: "my answer" });
    expect(d.clearPending).toHaveBeenCalledWith(7);
    expect(out).toContain("Holds up.");
  });

  it("advances pending to the next question when one is returned", async () => {
    const next = { gapId: "g2", gapLabel: "expiry", kind: "socratic" as const, prompt: "How long do keys live?" };
    const d = deps({
      submitAnswer: vi.fn().mockResolvedValue({ outcome: "fail", coveredGapLabels: [], feedback: "Not yet.", progress: { status: "in_progress", maturity: 0, attempts: 1, lastInteractedAt: null }, learningStatus: "probing", nextQuestion: next }),
    });
    const out = await answerPending(7, "dunno", d);
    expect(d.setPending).toHaveBeenCalledWith(7, { topicId: "t1", gapId: "g2", mode: "socratic" });
    expect(out).toContain("How long do keys live?");
  });

  it("returns the no-pending message when nothing is in flight", async () => {
    const d = deps({ getPending: vi.fn().mockResolvedValue(null) });
    expect(await answerPending(7, "x", d)).toBe(NO_PENDING_REPLY);
  });
});
