import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  insertedRows: [] as Array<Record<string, unknown>>,
  existingNotionPageIds: new Set<string>(),
}));

// insertKnowledgeSource/insertKnowledgeSources await `.values(rowOrRows)` directly (no further
// chaining).
// The array branch records rows immediately so both the plain-await and chained callers see them.
vi.mock("../db/client.js", () => ({
  getDb: () => ({
    insert: () => ({
      values: (rowOrRows: Record<string, unknown> | Record<string, unknown>[]) => {
        if (!Array.isArray(rowOrRows)) {
          state.insertedRows.push(rowOrRows);
          return Promise.resolve();
        }

        state.insertedRows.push(...rowOrRows);

        return {
          onConflictDoNothing: () => ({
            returning: async () => {
              const accepted = rowOrRows.filter((row) => {
                const notionPageId = row.notionPageId as string | undefined;

                return !(notionPageId && state.existingNotionPageIds.has(notionPageId));
              });

              state.insertedRows = state.insertedRows.filter((row) => accepted.includes(row));

              return accepted.map((row) => ({ ...row, createdAt: new Date() }));
            },
          }),
        };
      },
    }),
  }),
}));

const { insertKnowledgeSource, insertKnowledgeSources } =
  await import("./knowledge-source.repo.js");

describe("insertKnowledgeSource", () => {
  beforeEach(() => {
    state.insertedRows = [];
    state.existingNotionPageIds = new Set();
  });

  it("stores the pasted text as a pending prose knowledge source", async () => {
    const created = await insertKnowledgeSource("Some pasted prose.");

    expect(state.insertedRows).toEqual([
      {
        id: expect.stringMatching(/^ks_/),
        kind: "prose",
        rawText: "Some pasted prose.",
        status: "pending",
        subjectId: null,
        extractionModelId: null,
      },
    ]);
    expect(created).toMatchObject({
      kind: "prose",
      rawText: "Some pasted prose.",
      status: "pending",
    });
    expect(created.id).toMatch(/^ks_/);
    expect(created.createdAt).toBeInstanceOf(Date);
  });
});

describe("insertKnowledgeSource model choice", () => {
  beforeEach(() => {
    state.insertedRows = [];
    state.existingNotionPageIds = new Set();
  });

  it("should remember the chosen extraction model on the stored source", async () => {
    const created = await insertKnowledgeSource("Some pasted prose.", null, "openrouter/openai/gpt-6-luna");

    expect(state.insertedRows[0]).toMatchObject({ extractionModelId: "openrouter/openai/gpt-6-luna" });
    expect(created.extractionModelId).toBe("openrouter/openai/gpt-6-luna");
  });

  it("should remember the same model on every source of a batch", async () => {
    await insertKnowledgeSources(["One.", "Two."], null, "openrouter/openai/gpt-5-mini");

    expect(state.insertedRows.map((row) => (row as { extractionModelId: string }).extractionModelId)).toEqual([
      "openrouter/openai/gpt-5-mini",
      "openrouter/openai/gpt-5-mini",
    ]);
  });
});

describe("insertKnowledgeSources", () => {
  beforeEach(() => {
    state.insertedRows = [];
    state.existingNotionPageIds = new Set();
  });

  it("stores each text as its own pending prose knowledge source", async () => {
    const created = await insertKnowledgeSources(["First idea.", "Second idea."]);

    expect(state.insertedRows).toEqual([
      { id: expect.stringMatching(/^ks_/), kind: "prose", rawText: "First idea.", status: "pending", subjectId: null, extractionModelId: null },
      { id: expect.stringMatching(/^ks_/), kind: "prose", rawText: "Second idea.", status: "pending", subjectId: null, extractionModelId: null },
    ]);
    expect(created).toHaveLength(2);
    expect(created.every((row) => row.createdAt instanceof Date)).toBe(true);
  });

  it("inserts nothing and returns an empty array for an empty batch", async () => {
    const created = await insertKnowledgeSources([]);

    expect(state.insertedRows).toEqual([]);
    expect(created).toEqual([]);
  });

  it("caps a single batch at 100 sources so one submission can't queue an unbounded batch", async () => {
    const texts = Array.from({ length: 150 }, (_, i) => `Idea ${i}`);

    const created = await insertKnowledgeSources(texts);

    expect(state.insertedRows).toHaveLength(100);
    expect(created).toHaveLength(100);
  });
});
