import { describe, it, expect } from "vitest";
import type {
  AnswerSocraticResult,
  SocraticSession,
  SocraticTurn,
} from "@post-anki/shared";
import { formatSocraticAnswer, formatTurn } from "./socratic-view.js";

function turn(over: Partial<SocraticTurn> = {}): SocraticTurn {
  return {
    id: "turn1",
    gapId: "g1",
    conceptLabel: "Idempotency keys",
    prompt: "Why do we need them?",
    order: 0,
    ...over,
  };
}

function session(over: Partial<SocraticSession> = {}): SocraticSession {
  return {
    id: "ss1",
    topicId: "t1",
    curriculumId: "c1",
    status: "active",
    current: turn(),
    conceptsTotal: 3,
    conceptsCovered: 0,
    topicMaturity: 20,
    ...over,
  };
}

describe("formatTurn", () => {
  it("shows the concept, progress and prompt", () => {
    const text = formatTurn(turn(), session());
    expect(text).toContain("Idempotency keys");
    expect(text).toContain("concept 1/3 · topic 20%");
    expect(text).toContain("Why do we need them?");
  });
});

describe("formatSocraticAnswer", () => {
  it("appends the next prompt when advancing", () => {
    const result: AnswerSocraticResult = {
      action: "advance",
      degree: "correct",
      feedback: "Nailed it.",
      conceptLabel: "Idempotency keys",
      covered: true,
      next: turn({ id: "turn2", conceptLabel: "Retries", prompt: "What about retries?" }),
      status: "active",
      conceptsCovered: 1,
      conceptsTotal: 3,
      topicMaturity: 45,
    };
    const text = formatSocraticAnswer(result);
    expect(text).toContain("Nailed it.");
    expect(text).toContain("Retries");
    expect(text).toContain("What about retries?");
  });

  it("announces completion when there is no next turn", () => {
    const result: AnswerSocraticResult = {
      action: "advance",
      degree: "correct",
      feedback: "Great.",
      conceptLabel: "Retries",
      covered: true,
      next: null,
      status: "completed",
      conceptsCovered: 3,
      conceptsTotal: 3,
      topicMaturity: 100,
    };
    const text = formatSocraticAnswer(result);
    expect(text).toContain("Topic complete");
    expect(text).toContain("100%");
  });
});
