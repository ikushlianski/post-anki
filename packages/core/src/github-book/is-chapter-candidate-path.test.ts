import { describe, expect, it } from "vitest";
import { isChapterCandidatePath } from "./is-chapter-candidate-path";

describe("isChapterCandidatePath", () => {
  it("accepts a chapter markdown file nested under a part directory", () => {
    expect(
      isChapterCandidatePath("01-Part_One/Chapter_1-Prompt_Chaining-abc123.md"),
    ).toBe(true);
  });

  it("rejects a non-markdown file", () => {
    expect(isChapterCandidatePath("01-Part_One/cover.png")).toBe(false);
    expect(isChapterCandidatePath("package.json")).toBe(false);
  });

  it("rejects README, LICENSE and similar non-content files, case-insensitively", () => {
    expect(isChapterCandidatePath("README.md")).toBe(false);
    expect(isChapterCandidatePath("readme.md")).toBe(false);
    expect(isChapterCandidatePath("CONTRIBUTING.md")).toBe(false);
    expect(isChapterCandidatePath("LICENSE.md")).toBe(false);
    expect(isChapterCandidatePath("CODE_OF_CONDUCT.md")).toBe(false);
    expect(isChapterCandidatePath("CHANGELOG.md")).toBe(false);
  });

  it("rejects files under a .github directory", () => {
    expect(isChapterCandidatePath(".github/ISSUE_TEMPLATE.md")).toBe(false);
    expect(isChapterCandidatePath("docs/.github/notes.md")).toBe(false);
  });

  it("accepts a nested README-looking chapter that is not literally named README", () => {
    expect(isChapterCandidatePath("01-Part_One/Chapter_1-Readme_To_The_Reader-abc.md")).toBe(true);
  });

  it("rejects numbered ceremonial front matter such as dedication, acknowledgment and foreword", () => {
    expect(
      isChapterCandidatePath("00-Introduction/01-Dedication-1cQ61mNpiWn6eSORmWjEjF44vN2Lpba8kyKmNwIC60ig.md"),
    ).toBe(false);
    expect(
      isChapterCandidatePath(
        "00-Introduction/02-Acknowledgment-1u2y6tY48bw8nriDUuwWEf9s8g66vyIqBKSKZDOS-n0s.md",
      ),
    ).toBe(false);
    expect(
      isChapterCandidatePath("00-Introduction/03-Foreword-18Q9kfZuCTL37ztrSjLxwf8Elr5UfAiAavmnj0IqSpbU.md"),
    ).toBe(false);
  });

  it("keeps substantive numbered front matter such as an introduction", () => {
    expect(
      isChapterCandidatePath("00-Introduction/05-Introduction-1K5jwqB6jh20uHL0TTWxqWOxFk-dzFxRvHzrRRV79hrg.md"),
    ).toBe(true);
    expect(
      isChapterCandidatePath(
        "00-Introduction/06-What_makes_an_AI_system_an_Agent-1Nw6hRa7ItdLr_Tj5hF2q-OH8B_uPKb--RLn8SXZKA94.md",
      ),
    ).toBe(true);
    expect(
      isChapterCandidatePath(
        "00-Introduction/04-A_Thought_Leaders_Perspective_Power_and_Responsibility-1PWhaXD_UNKgJaxYe3JBxRFRt3_B8Wm67CFxtSBQ4LkU.md",
      ),
    ).toBe(true);
  });

  it("excludes reference back matter that is not study material", () => {
    expect(isChapterCandidatePath("06-Back_Matter/Glossary-1abcDEF.md")).toBe(false);
    expect(isChapterCandidatePath("06-Back_Matter/Index_of_Terms-1abcDEF.md")).toBe(false);
  });

  it("excludes the whole book compiled into one root file, which would duplicate every chapter", () => {
    expect(
      isChapterCandidatePath("Agentic_Design_Patterns-1abcDEF.md", "Agentic-Design-Patterns"),
    ).toBe(false);
  });

  it("keeps a real chapter that merely echoes the repository name", () => {
    expect(
      isChapterCandidatePath(
        "01-Part_One/Chapter_1-Agentic_Design_Patterns_Intro-1abcDEF.md",
        "Agentic-Design-Patterns",
      ),
    ).toBe(true);
  });

  it("keeps a root file named after the repository when no repository name is known", () => {
    expect(isChapterCandidatePath("Agentic_Design_Patterns-1abcDEF.md")).toBe(true);
  });
});
