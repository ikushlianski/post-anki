import { describe, expect, it } from "vitest";
import { AGENTIC_DESIGN_PATTERNS_PATHS } from "./agentic-design-patterns-fixture";
import { sortChapterPaths } from "./sort-chapter-paths";

describe("sortChapterPaths", () => {
  it("orders paths by their zero-padded part and chapter numbering", () => {
    const paths = [
      "02-Part_Two/Chapter_9-Learning_and_Adaptation-hash.md",
      "00-Introduction/05-Introduction-hash.md",
      "01-Part_One/Chapter_1-Prompt_Chaining-hash.md",
      "02-Part_Two/Chapter_10-Model_Context_Protocol-hash.md",
      "01-Part_One/Chapter_2-Routing-hash.md",
    ];

    expect(sortChapterPaths(paths)).toEqual([
      "00-Introduction/05-Introduction-hash.md",
      "01-Part_One/Chapter_1-Prompt_Chaining-hash.md",
      "01-Part_One/Chapter_2-Routing-hash.md",
      "02-Part_Two/Chapter_9-Learning_and_Adaptation-hash.md",
      "02-Part_Two/Chapter_10-Model_Context_Protocol-hash.md",
    ]);
  });

  it("sorts unpadded chapter numbers numerically rather than lexically", () => {
    expect(sortChapterPaths(["Chapter_10.md", "Chapter_2.md", "Chapter_1.md"])).toEqual([
      "Chapter_1.md",
      "Chapter_2.md",
      "Chapter_10.md",
    ]);
  });

  it("does not mutate the input array", () => {
    const paths = ["b.md", "a.md"];
    const sorted = sortChapterPaths(paths);

    expect(paths).toEqual(["b.md", "a.md"]);
    expect(sorted).toEqual(["a.md", "b.md"]);
  });

  it("falls back to stable alphabetical ordering when no path carries a number", () => {
    const paths = ["Glossary-hash.md", "Conclusion-hash.md", "Appendix-hash.md"];

    expect(sortChapterPaths(paths)).toEqual(["Appendix-hash.md", "Conclusion-hash.md", "Glossary-hash.md"]);
  });

  it("orders the real Agentic-Design-Patterns tree by part and chapter number, not by lexicographic path", () => {
    const sorted = sortChapterPaths([...AGENTIC_DESIGN_PATTERNS_PATHS]);

    const chapter8Index = sorted.findIndex((path) => path.includes("Chapter_8-"));
    const chapter9Index = sorted.findIndex((path) => path.includes("Chapter_9-"));
    const chapter10Index = sorted.findIndex((path) => path.includes("Chapter_10-"));
    const chapter11Index = sorted.findIndex((path) => path.includes("Chapter_11-"));

    expect(chapter8Index).toBeLessThan(chapter9Index);
    expect(chapter9Index).toBeLessThan(chapter10Index);
    expect(chapter10Index).toBeLessThan(chapter11Index);

    expect(sorted.slice(0, 6)).toEqual([
      "00-Introduction/01-Dedication-1cQ61mNpiWn6eSORmWjEjF44vN2Lpba8kyKmNwIC60ig.md",
      "00-Introduction/02-Acknowledgment-1u2y6tY48bw8nriDUuwWEf9s8g66vyIqBKSKZDOS-n0s.md",
      "00-Introduction/03-Foreword-18Q9kfZuCTL37ztrSjLxwf8Elr5UfAiAavmnj0IqSpbU.md",
      "00-Introduction/04-A_Thought_Leaders_Perspective_Power_and_Responsibility-1PWhaXD_UNKgJaxYe3JBxRFRt3_B8Wm67CFxtSBQ4LkU.md",
      "00-Introduction/05-Introduction-1K5jwqB6jh20uHL0TTWxqWOxFk-dzFxRvHzrRRV79hrg.md",
      "00-Introduction/06-What_makes_an_AI_system_an_Agent-1Nw6hRa7ItdLr_Tj5hF2q-OH8B_uPKb--RLn8SXZKA94.md",
    ]);

    const chapter21Index = sorted.findIndex((path) => path.includes("Chapter_21-"));
    const appendixAIndex = sorted.findIndex((path) => path.includes("Appendix_A-"));
    const appendixGIndex = sorted.findIndex((path) => path.includes("Appendix_G-"));

    expect(appendixAIndex).toBeGreaterThan(chapter21Index);
    expect(appendixGIndex).toBeGreaterThan(appendixAIndex);
  });
});
