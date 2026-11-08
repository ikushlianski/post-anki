import { afterEach, describe, expect, it, vi } from "vitest";
import type { KnowledgeSource } from "../knowledge-source/knowledge-source.repo.js";

vi.mock("../db/client.js", () => ({ getDb: vi.fn() }));
vi.mock("./business-deck-mapping.js", () => ({ resolveDeckSubjectId: vi.fn() }));
vi.mock("../knowledge-source/knowledge-source-keyed-insert.repo.js", () => ({
  insertKeyedKnowledgeSources: vi.fn(),
}));
vi.mock("../knowledge-source/knowledge-source-kick.js", () => ({ kickSourcesAfterAdd: vi.fn() }));

const { resolveDeckSubjectId } = await import("./business-deck-mapping.js");
const { insertKeyedKnowledgeSources } = await import(
  "../knowledge-source/knowledge-source-keyed-insert.repo.js"
);
const { kickSourcesAfterAdd } = await import("../knowledge-source/knowledge-source-kick.js");
const { submitKnowledge, submitKnowledgeInputSchema } = await import("./submit-knowledge.tool.js");

afterEach(() => {
  vi.resetAllMocks();
});

function note(key = "anki:abcdef123", text = "Some note") {
  return { key, text };
}

function row(id: string, importKey: string): KnowledgeSource {
  return { id, importKey } as KnowledgeSource;
}

function resolveOk() {
  vi.mocked(resolveDeckSubjectId).mockResolvedValue({ subjectId: "sub_m", subjectName: "Marketing" });
}

describe("submit_knowledge input schema", () => {
  it("should reject an empty batch and a batch over 100 notes", () => {
    expect(submitKnowledgeInputSchema.safeParse({ deck: "d", notes: [] }).success).toBe(false);

    const many = Array.from({ length: 101 }, (_, i) => note(`anki:key${String(i).padStart(6, "0")}`));

    expect(submitKnowledgeInputSchema.safeParse({ deck: "d", notes: many.slice(0, 100) }).success).toBe(true);
    expect(submitKnowledgeInputSchema.safeParse({ deck: "d", notes: many }).success).toBe(false);
  });

  it("should reject keys that are too short or contain upper case", () => {
    expect(submitKnowledgeInputSchema.safeParse({ deck: "d", notes: [note("anki:ab")] }).success).toBe(false);
    expect(submitKnowledgeInputSchema.safeParse({ deck: "d", notes: [note("anki:ABCDEF123")] }).success).toBe(
      false,
    );
  });

  it("should reject blank text and text over 20000 characters", () => {
    expect(submitKnowledgeInputSchema.safeParse({ deck: "d", notes: [note(undefined, "   ")] }).success).toBe(
      false,
    );
    expect(
      submitKnowledgeInputSchema.safeParse({ deck: "d", notes: [note(undefined, "x".repeat(20001))] }).success,
    ).toBe(false);
  });
});

describe("submitKnowledge", () => {
  it("should refuse a token without the write scope before any store or repo call", async () => {
    const result = await submitKnowledge({ deck: "Продажи", notes: [note()] }, { scopes: [] });

    expect(result).toEqual({ error: "missing_scope" });
    expect(resolveDeckSubjectId).not.toHaveBeenCalled();
    expect(insertKeyedKnowledgeSources).not.toHaveBeenCalled();
  });

  it.each([["*"], ["knowledge:write"]])("should let scope %s write", async (scope) => {
    resolveOk();
    vi.mocked(insertKeyedKnowledgeSources).mockResolvedValue([row("ks_1", "anki:abcdef123")]);

    const result = await submitKnowledge({ deck: "Продажи", notes: [note()] }, { scopes: [scope] });

    expect(result).toMatchObject({ created: 1 });
  });

  it("should refuse an unknown deck and insert nothing", async () => {
    vi.mocked(resolveDeckSubjectId).mockResolvedValue({ error: "unknown_deck" });

    const result = await submitKnowledge({ deck: "Cooking", notes: [note()] }, { scopes: ["*"] });

    expect(result).toEqual({ error: "unknown_deck" });
    expect(insertKeyedKnowledgeSources).not.toHaveBeenCalled();
  });

  it("should insert with the caller's keys, report counts and kick the new sources once", async () => {
    resolveOk();
    vi.mocked(insertKeyedKnowledgeSources).mockResolvedValue([row("ks_1", "anki:aaaaaaaa")]);

    const result = await submitKnowledge(
      { deck: "Маркетинг и СММ", notes: [note("anki:aaaaaaaa", "A"), note("anki:bbbbbbbb", "B")] },
      { scopes: ["knowledge:write"] },
    );

    expect(insertKeyedKnowledgeSources).toHaveBeenCalledWith(
      [
        { importKey: "anki:aaaaaaaa", rawText: "A" },
        { importKey: "anki:bbbbbbbb", rawText: "B" },
      ],
      "sub_m",
    );
    expect(result).toEqual({
      subjectId: "sub_m",
      subjectName: "Marketing",
      created: 1,
      alreadyPresent: 1,
      sourceIds: ["ks_1"],
    });
    expect(kickSourcesAfterAdd).toHaveBeenCalledTimes(1);
    expect(kickSourcesAfterAdd).toHaveBeenCalledWith(["ks_1"]);
  });

  it("should not kick when every note was already present", async () => {
    resolveOk();
    vi.mocked(insertKeyedKnowledgeSources).mockResolvedValue([]);

    const result = await submitKnowledge({ deck: "Продажи", notes: [note()] }, { scopes: ["*"] });

    expect(result).toMatchObject({ created: 0, alreadyPresent: 1, sourceIds: [] });
    expect(kickSourcesAfterAdd).not.toHaveBeenCalled();
  });
});
