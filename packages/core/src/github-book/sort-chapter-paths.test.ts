import { describe, expect, it } from "vitest";
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
});
