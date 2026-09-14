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
});
