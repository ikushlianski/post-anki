import { describe, it, expect } from "vitest";
import type { StructureSnapshot } from "@post-anki/shared";
import {
  applyAddModule,
  applyMergeModules,
  applyPromoteTopicToModule,
  applyRemoveModule,
  applyRenameModule,
  applySplitModuleOut,
} from "./structure-editor";

function snapshot(): StructureSnapshot {
  return {
    strictOrder: false,
    modules: [
      {
        title: "Introduction",
        level: "basic",
        tags: [],
        topics: [{ title: "Overview", summary: null, suggestedDepth: "working" }],
      },
      {
        title: "Security",
        level: "medium",
        tags: ["security"],
        topics: [
          { title: "Encryption", summary: null, suggestedDepth: "working" },
          { title: "Auth", summary: null, suggestedDepth: "deep" },
        ],
      },
      {
        title: "Advanced Topics",
        level: "advanced",
        tags: [],
        topics: [{ title: "Internals", summary: null, suggestedDepth: "deep" }],
      },
    ],
  };
}

describe("applyAddModule", () => {
  describe("no placement given", () => {
    it("appends the new module at the end", () => {
      const result = applyAddModule(snapshot(), { title: "Testing", topics: ["Unit tests"] });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.snapshot.modules.map((m) => m.title)).toEqual([
        "Introduction",
        "Security",
        "Advanced Topics",
        "Testing",
      ]);
      expect(result.snapshot.modules.at(-1)!.topics.map((t) => t.title)).toEqual(["Unit tests"]);
    });
  });

  describe("placed after a named module", () => {
    it("inserts immediately after that module", () => {
      const result = applyAddModule(snapshot(), {
        title: "Testing",
        topics: [],
        afterModuleTitle: "Introduction",
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.snapshot.modules.map((m) => m.title)).toEqual([
        "Introduction",
        "Testing",
        "Security",
        "Advanced Topics",
      ]);
    });
  });

  describe("an afterModuleTitle that does not exist", () => {
    it("fails with an actionable error naming the available modules", () => {
      const result = applyAddModule(snapshot(), {
        title: "Testing",
        topics: [],
        afterModuleTitle: "Nonexistent",
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toContain("Nonexistent");
      expect(result.error).toContain("Introduction");
    });
  });
});

describe("applyRemoveModule", () => {
  it("removes the named module, matching case-insensitively", () => {
    const result = applyRemoveModule(snapshot(), { moduleTitle: "security" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.modules.map((m) => m.title)).toEqual(["Introduction", "Advanced Topics"]);
  });

  it("refuses to remove the last remaining module", () => {
    const single: StructureSnapshot = { strictOrder: false, modules: [snapshot().modules[0]!] };

    const result = applyRemoveModule(single, { moduleTitle: "Introduction" });

    expect(result.ok).toBe(false);
  });

  it("fails on an unknown module title", () => {
    const result = applyRemoveModule(snapshot(), { moduleTitle: "Ghost" });

    expect(result.ok).toBe(false);
  });
});

describe("applyRenameModule", () => {
  it("renames the matching module and leaves the rest untouched", () => {
    const result = applyRenameModule(snapshot(), {
      moduleTitle: "Security",
      newTitle: "Security & Compliance",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.modules.map((m) => m.title)).toEqual([
      "Introduction",
      "Security & Compliance",
      "Advanced Topics",
    ]);
  });
});

describe("applyMergeModules", () => {
  it("combines the topics of every named module into one, at the first module's position", () => {
    const result = applyMergeModules(snapshot(), {
      moduleTitles: ["Security", "Advanced Topics"],
      newTitle: "Security & Internals",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.modules.map((m) => m.title)).toEqual(["Introduction", "Security & Internals"]);
    expect(result.snapshot.modules[1]!.topics.map((t) => t.title)).toEqual(["Encryption", "Auth", "Internals"]);
  });

  it("rejects fewer than two module titles", () => {
    const result = applyMergeModules(snapshot(), { moduleTitles: ["Security"], newTitle: "X" });

    expect(result.ok).toBe(false);
  });

  it("fails when a named module does not exist", () => {
    const result = applyMergeModules(snapshot(), {
      moduleTitles: ["Security", "Ghost"],
      newTitle: "X",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("Ghost");
  });
});

describe("applyPromoteTopicToModule", () => {
  it("turns the topic into its own module placed right after the source module", () => {
    const result = applyPromoteTopicToModule(snapshot(), {
      moduleTitle: "Security",
      topicTitle: "Auth",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.modules.map((m) => m.title)).toEqual([
      "Introduction",
      "Security",
      "Auth",
      "Advanced Topics",
    ]);
    expect(result.snapshot.modules[1]!.topics.map((t) => t.title)).toEqual(["Encryption"]);
    expect(result.snapshot.modules[2]!.topics).toEqual([]);
  });

  it("fails when the topic does not exist in that module", () => {
    const result = applyPromoteTopicToModule(snapshot(), {
      moduleTitle: "Security",
      topicTitle: "Ghost topic",
    });

    expect(result.ok).toBe(false);
  });
});

describe("applySplitModuleOut", () => {
  it("extracts the module and returns the remaining snapshot separately", () => {
    const result = applySplitModuleOut(snapshot(), { moduleTitle: "Advanced Topics" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.extractedModule.title).toBe("Advanced Topics");
    expect(result.result.remainingSnapshot.modules.map((m) => m.title)).toEqual([
      "Introduction",
      "Security",
    ]);
  });

  it("refuses to split out the only remaining module", () => {
    const single: StructureSnapshot = { strictOrder: false, modules: [snapshot().modules[0]!] };

    const result = applySplitModuleOut(single, { moduleTitle: "Introduction" });

    expect(result.ok).toBe(false);
  });
});
