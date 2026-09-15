import { describe, expect, it } from "vitest";
import { formatTranscript } from "./format-transcript";

describe("formatTranscript", () => {
  it("labels each turn by role, learner first then assistant", () => {
    const block = formatTranscript(
      [
        { role: "user", text: "What is idempotency?" },
        { role: "assistant", text: "Doing an operation twice has the same effect as once." },
      ],
      { assistantLabel: "Tutor" },
    );

    expect(block).toBe(
      "Learner: What is idempotency?\nTutor: Doing an operation twice has the same effect as once.",
    );
  });

  it("uses a custom learner label when given one", () => {
    const block = formatTranscript([{ role: "user", text: "Hi" }], {
      assistantLabel: "Mentor",
      learnerLabel: "Student",
    });

    expect(block).toBe("Student: Hi");
  });

  it("returns an explicit empty-state string when no turns exist and one was requested", () => {
    const block = formatTranscript([], { assistantLabel: "Mentor", emptyText: "(no conversation yet)" });

    expect(block).toBe("(no conversation yet)");
  });

  it("returns a bare empty string when no turns exist and no empty-state text was requested", () => {
    const block = formatTranscript([], { assistantLabel: "Tutor" });

    expect(block).toBe("");
  });

  it("keeps only the most recent turns once the conversation exceeds the default cap", () => {
    const turns = Array.from({ length: 30 }, (_, i) => ({
      role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
      text: `turn ${i}`,
    }));

    const block = formatTranscript(turns, { assistantLabel: "Tutor" });

    expect(block).not.toContain("turn 0\n");
    expect(block.startsWith("Learner: turn 6")).toBe(true);
    expect(block.endsWith("turn 29")).toBe(true);
    expect(block.split("\n")).toHaveLength(24);
  });

  it("keeps the full history when a caller explicitly opts out of the cap", () => {
    const turns = Array.from({ length: 30 }, (_, i) => ({
      role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
      text: `turn ${i}`,
    }));

    const block = formatTranscript(turns, { assistantLabel: "Tutor", maxTurns: Infinity });

    expect(block.split("\n")).toHaveLength(30);
  });
});
