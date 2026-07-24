import { describe, it, expect } from "vitest";
import {
  buildParsePrompt,
  buildMergePrompt,
  buildResearchPrompt,
  buildStructureDraftPrompt,
  buildStructureGuidedRegenPrompt,
  buildStructureToolTurnPrompt,
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

describe("buildResearchPrompt", () => {
  describe("with grounding text and curriculum context", () => {
    it("includes the technology name, the grounding, and asks for a tiered map", () => {
      const prompt = buildResearchPrompt(
        "Temporal",
        "Temporal is a durable execution platform...",
        FULL_CONTEXT,
      );

      expect(prompt).toContain("Curriculum: Event-Driven Systems");
      expect(prompt).toContain("Temporal is a durable execution platform");
      expect(prompt).toContain("basic/medium/advanced");
    });
  });

  describe("without curriculum context", () => {
    it("falls back to naming the technology directly", () => {
      const prompt = buildResearchPrompt("Temporal", "some grounding", null);

      expect(prompt).toContain("Technology: Temporal");
    });
  });

  describe("when the web search returned nothing", () => {
    it("tells the agent to rely on its own knowledge", () => {
      const prompt = buildResearchPrompt("Temporal", "", FULL_CONTEXT);

      expect(prompt).toContain("rely on your own knowledge");
    });
  });

  describe("grounded via the site's own llms.txt", () => {
    it("frames the grounding as the site's own curated map", () => {
      const prompt = buildResearchPrompt(
        "Temporal",
        "# Temporal docs index...",
        FULL_CONTEXT,
        { groundingKind: "llms_txt" },
      );

      expect(prompt).toContain("site's own");
    });
  });

  describe("grounded via anchored web search", () => {
    it("does not claim the grounding is the site's own curated map", () => {
      const prompt = buildResearchPrompt(
        "Temporal",
        "search results...",
        FULL_CONTEXT,
        { groundingKind: "web_research" },
      );

      expect(prompt).not.toContain("site's own");
    });
  });

  describe("with a preferred level", () => {
    it("tells the agent which tier the learner wants fuller treatment for", () => {
      const prompt = buildResearchPrompt("Temporal", "grounding", FULL_CONTEXT, {
        preferredLevel: "advanced",
      });

      expect(prompt).toContain("advanced");
      expect(prompt.toLowerCase()).toContain("fuller");
    });
  });

  describe("with no preferred level", () => {
    it("does not mention a level preference", () => {
      const prompt = buildResearchPrompt("Temporal", "grounding", FULL_CONTEXT);

      expect(prompt.toLowerCase()).not.toContain("fuller");
    });
  });
});

describe("buildStructureDraftPrompt", () => {
  it("includes source text and trusted-source candidates with their urls", () => {
    const prompt = buildStructureDraftPrompt(FULL_CONTEXT, "pasted grounding text", [
      { url: "https://docs.example.com", title: "Example docs" },
    ]);

    expect(prompt).toContain("pasted grounding text");
    expect(prompt).toContain("https://docs.example.com");
    expect(prompt).toContain("Example docs");
    expect(prompt.toLowerCase()).toContain("first draft");
  });

  describe("no trusted sources found", () => {
    it("says so instead of rendering an empty list", () => {
      const prompt = buildStructureDraftPrompt(FULL_CONTEXT, "", []);

      expect(prompt.toLowerCase()).toContain("nothing usable");
    });
  });
});

const SNAPSHOT = {
  modules: [
    { title: "Introduction", level: "basic", topics: [{ title: "Overview" }] },
    { title: "Security", level: "medium", topics: [] },
  ],
};

describe("buildStructureToolTurnPrompt", () => {
  it("renders the current draft, turn history, and the study-time summary", () => {
    const prompt = buildStructureToolTurnPrompt(
      FULL_CONTEXT,
      "source text",
      [{ url: "https://docs.example.com", title: "Example docs" }],
      [
        { role: "assistant", message: "Here's a first draft." },
        { role: "user", message: "Merge Introduction and Security." },
      ],
      SNAPSHOT,
      "roughly 2 week(s) — 1 topics across 2 modules (target: 4-8 weeks)",
    );

    expect(prompt).toContain("Introduction");
    expect(prompt).toContain("Security");
    expect(prompt).toContain("Merge Introduction and Security.");
    expect(prompt).toContain("roughly 2 week(s)");
    expect(prompt.toLowerCase()).toContain("use your tools");
  });

  describe("with flagged research-gap labels", () => {
    it("includes the flagged labels and the supplemental sources found for them", () => {
      const prompt = buildStructureToolTurnPrompt(
        FULL_CONTEXT,
        "source text",
        [],
        [],
        SNAPSHOT,
        "roughly 2 week(s)",
        {
          researchGapLabels: ["Security"],
          supplementalSources: [{ url: "https://blog.example.com/security", title: "Security blog post" }],
        },
      );

      expect(prompt).toContain("Security");
      expect(prompt).toContain("https://blog.example.com/security");
    });
  });

  describe("with no flagged labels", () => {
    it("does not mention supplemental research at all", () => {
      const prompt = buildStructureToolTurnPrompt(FULL_CONTEXT, "source text", [], [], SNAPSHOT, "roughly 2 week(s)");

      expect(prompt.toLowerCase()).not.toContain("supplemental");
    });
  });
});

describe("buildStructureGuidedRegenPrompt", () => {
  it("includes the current draft and the specific guidance for this revision", () => {
    const prompt = buildStructureGuidedRegenPrompt(
      FULL_CONTEXT,
      "source text",
      [],
      SNAPSHOT,
      "Add more depth to the security topics.",
    );

    expect(prompt).toContain("Introduction");
    expect(prompt).toContain("Add more depth to the security topics.");
    expect(prompt.toLowerCase()).toContain("revised full structure");
  });
});
