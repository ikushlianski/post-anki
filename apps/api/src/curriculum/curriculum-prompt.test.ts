import { describe, it, expect } from "vitest";
import {
  buildParsePrompt,
  buildMergePrompt,
  type PromptContext,
} from "./curriculum-prompt.js";

const FULL_CONTEXT: PromptContext = {
  curriculumName: "Event-Driven Systems",
  curriculumDescription: "Focus on tradeoffs, not syntax.",
  subjectName: "Distributed Systems",
  subjectDescription: "For a senior dev moving into an architect role.",
};

describe("buildParsePrompt", () => {
  describe("with subject and curriculum context", () => {
    it("gives the agent the subject, its context, and the curriculum context", () => {
      const prompt = buildParsePrompt(FULL_CONTEXT, "some pasted text");

      expect(prompt).toContain("Subject: Distributed Systems");
      expect(prompt).toContain(
        "Subject context: For a senior dev moving into an architect role.",
      );
      expect(prompt).toContain("Curriculum: Event-Driven Systems");
      expect(prompt).toContain("Curriculum context: Focus on tradeoffs, not syntax.");
      expect(prompt).toContain("some pasted text");
    });
  });

  describe("when no sources were pasted", () => {
    it("asks for a skeleton guided by the available context", () => {
      const prompt = buildParsePrompt(FULL_CONTEXT, "");

      expect(prompt).toContain("no sources pasted");
      expect(prompt).toContain("guided by the subject and curriculum context");
    });
  });

  describe("when descriptions are empty or whitespace", () => {
    it("omits the context lines instead of emitting blanks", () => {
      const prompt = buildParsePrompt(
        {
          curriculumName: "Caching",
          curriculumDescription: "   ",
          subjectName: "Backend",
          subjectDescription: null,
        },
        "text",
      );

      expect(prompt).not.toContain("Subject context:");
      expect(prompt).not.toContain("Curriculum context:");
      expect(prompt).toContain("Subject: Backend");
      expect(prompt).toContain("Curriculum: Caching");
    });
  });
});

describe("buildMergePrompt", () => {
  describe("with locked (studied) modules", () => {
    it("lists locked modules with their topics and asks to rebuild the rest", () => {
      const prompt = buildMergePrompt(
        FULL_CONTEXT,
        [{ title: "Messaging", topics: ["Backpressure"] }],
        "new article text",
      );

      expect(prompt).toContain("- Messaging");
      expect(prompt).toContain("    - Backpressure");
      expect(prompt).toContain("KEEP them as-is");
      expect(prompt).toContain("Rebuild the REST of the curriculum");
      expect(prompt).toContain("new article text");
      expect(prompt).toContain("Subject context:");
    });
  });

  describe("with nothing locked", () => {
    it("invites the agent to shape the whole curriculum", () => {
      const prompt = buildMergePrompt(FULL_CONTEXT, [], "text");

      expect(prompt).toContain("nothing locked yet");
    });
  });
});
