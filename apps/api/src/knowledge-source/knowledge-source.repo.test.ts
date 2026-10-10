import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  insertedRows: [] as Array<Record<string, unknown>>,
  existingNotionPageIds: new Set<string>(),
}));

// insertKnowledgeSource/insertKnowledgeSources await `.values(rowOrRows)` directly (no further
// chaining); insertKnowledgeSourcesFromNotion chains `.values(rows).onConflictDoNothing().returning()`.
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

const { insertKnowledgeSource, insertKnowledgeSources, insertKnowledgeSourcesFromNotion } =
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

describe("insertKnowledgeSources", () => {
  beforeEach(() => {
    state.insertedRows = [];
    state.existingNotionPageIds = new Set();
  });

  it("stores each text as its own pending prose knowledge source", async () => {
    const created = await insertKnowledgeSources(["First idea.", "Second idea."]);

    expect(state.insertedRows).toEqual([
      { id: expect.stringMatching(/^ks_/), kind: "prose", rawText: "First idea.", status: "pending", subjectId: null },
      { id: expect.stringMatching(/^ks_/), kind: "prose", rawText: "Second idea.", status: "pending", subjectId: null },
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

describe("insertKnowledgeSourcesFromNotion", () => {
  beforeEach(() => {
    state.insertedRows = [];
    state.existingNotionPageIds = new Set();
  });

  it("inserts one pending notion knowledge source row per item, tagged with the data source id and page id", async () => {
    const created = await insertKnowledgeSourcesFromNotion(
      [
        { id: "r-1", text: "Idea one" },
        { id: "r-2", text: "Idea two" },
        { id: "r-3", text: "Idea three" },
      ],
      "ds-1",
    );

    expect(state.insertedRows).toEqual([
      {
        id: expect.stringMatching(/^ks_/),
        kind: "notion",
        rawText: "Idea one",
        status: "pending",
        notionDatabaseId: "ds-1",
        notionPageId: "r-1",
      },
      {
        id: expect.stringMatching(/^ks_/),
        kind: "notion",
        rawText: "Idea two",
        status: "pending",
        notionDatabaseId: "ds-1",
        notionPageId: "r-2",
      },
      {
        id: expect.stringMatching(/^ks_/),
        kind: "notion",
        rawText: "Idea three",
        status: "pending",
        notionDatabaseId: "ds-1",
        notionPageId: "r-3",
      },
    ]);
    expect(created).toHaveLength(3);
    expect(created.every((row) => row.createdAt instanceof Date)).toBe(true);
  });

  it("inserts nothing and returns an empty array for a database with no rows", async () => {
    const created = await insertKnowledgeSourcesFromNotion([], "ds-empty");

    expect(state.insertedRows).toEqual([]);
    expect(created).toEqual([]);
  });

  it("skips a page already imported in an earlier call instead of duplicating it", async () => {
    state.existingNotionPageIds.add("r-1");

    const created = await insertKnowledgeSourcesFromNotion(
      [
        { id: "r-1", text: "Already imported" },
        { id: "r-2", text: "New page" },
      ],
      "ds-1",
    );

    expect(state.insertedRows).toHaveLength(1);
    expect(state.insertedRows[0]).toMatchObject({ notionPageId: "r-2" });
    expect(created).toHaveLength(1);
  });

  it("caps a single import at 500 rows so one call can't queue an unbounded batch", async () => {
    const items = Array.from({ length: 600 }, (_, i) => ({ id: `r-${i}`, text: `Idea ${i}` }));

    const created = await insertKnowledgeSourcesFromNotion(items, "ds-big");

    expect(state.insertedRows).toHaveLength(500);
    expect(created).toHaveLength(500);
  });
});
