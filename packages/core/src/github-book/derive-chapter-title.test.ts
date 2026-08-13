import { describe, expect, it } from "vitest";
import { deriveChapterTitle } from "./derive-chapter-title";

describe("deriveChapterTitle", () => {
  it("strips a trailing hash and formats the chapter number", () => {
    expect(deriveChapterTitle("Chapter_1-Prompt_Chaining-a1b2c3d4e5f6.md")).toBe(
      "Chapter 1 — Prompt Chaining",
    );
  });

  it("strips a Google-Drive-style hash that itself contains hyphens", () => {
    expect(
      deriveChapterTitle(
        "Chapter_1-Prompt_Chaining-1flxKGrbnF2g8yh3F-oVD5Xx7ZumId56HbFpIiPdkqLI.md",
      ),
    ).toBe("Chapter 1 — Prompt Chaining");
  });

  it("keeps a genuine hyphenated compound word in the title while dropping the hash", () => {
    expect(
      deriveChapterTitle(
        "Chapter_7-Multi-Agent_Collaboration-1RZ5-2fykDQKOBx01pwfKkDe0GCs5ydca7xW9Q4wqS_M.md",
      ),
    ).toBe("Chapter 7 — Multi Agent Collaboration");
  });

  it("strips parentheses from an acronym-bearing title", () => {
    expect(
      deriveChapterTitle(
        "Chapter_10-Model_Context_Protocol_(MCP)-1e6XimYczKmhX9zpqEyxLFWPQgGuG0brp7Hic2sFl_qw.md",
      ),
    ).toBe("Chapter 10 — Model Context Protocol MCP");
  });

  it("handles a filename with no chapter number", () => {
    expect(deriveChapterTitle("Introduction.md")).toBe("Introduction");
  });

  it("handles a filename with no hash", () => {
    expect(deriveChapterTitle("Chapter_2-Routing.md")).toBe("Chapter 2 — Routing");
  });

  it("handles a filename with neither a hash nor a chapter number", () => {
    expect(deriveChapterTitle("Dedication.md")).toBe("Dedication");
  });

  it("handles a chapter number with no title text", () => {
    expect(deriveChapterTitle("Chapter_3.md")).toBe("Chapter 3");
  });

  it("drops a bare leading ordinal instead of leaving it in the title", () => {
    expect(
      deriveChapterTitle(
        "04-A_Thought_Leaders_Perspective_Power_and_Responsibility-1PWhaXD_UNKgJaxYe3JBxRFRt3_B8Wm67CFxtSBQ4LkU.md",
      ),
    ).toBe("A Thought Leaders Perspective Power and Responsibility");
  });

  it("never collapses to the bare ordinal even when the real name has lowercase connector words", () => {
    expect(
      deriveChapterTitle(
        "06-What_makes_an_AI_system_an_Agent-1Nw6hRa7ItdLr_Tj5hF2q-OH8B_uPKb--RLn8SXZKA94.md",
      ),
    ).toBe("What makes an AI system an Agent");
  });

  it("formats an Appendix_X filename into structured 'Appendix X — Name'", () => {
    expect(
      deriveChapterTitle(
        "Appendix_A-Advanced_Prompting_Techniques-1V7EKEWibOH6IhHD_PtbFZiml492-2191jDQCcTkhtTI.md",
      ),
    ).toBe("Appendix A — Advanced Prompting Techniques");
  });

  it("keeps a real digit-bearing acronym in the title rather than treating it as part of the hash", () => {
    expect(
      deriveChapterTitle(
        "Chapter_15-Inter_Agent_Communication_(A2A)-1H6HmUYcy5kugt5gt7Kh2Zzb8C62d5pu36RsgMNDCX24.md",
      ),
    ).toBe("Chapter 15 — Inter Agent Communication A2A");
  });

  it("strips a hash that itself ends in a lone trailing digit after a hyphen split", () => {
    expect(
      deriveChapterTitle("Chapter_13-Human_in_the_Loop-1ImOZcw6yeb7a-uRBMNP1VdovYfyip4IdsAcLu9yue-0.md"),
    ).toBe("Chapter 13 — Human in the Loop");
  });

  it("strips a hash whose hyphen split leaves a short letters-only fragment behind", () => {
    expect(
      deriveChapterTitle("Chapter_14-Knowledge_Retrieval_(RAG)-1v96Oobio6xDOqbK8ejsXjmOc4Dp2uoLMo5_gfJgi-NE.md"),
    ).toBe("Chapter 14 — Knowledge Retrieval RAG");
  });
});
