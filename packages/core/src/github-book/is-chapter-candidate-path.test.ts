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
});
