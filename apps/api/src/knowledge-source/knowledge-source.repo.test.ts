import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  insertedRows: [] as Array<Record<string, unknown>>,
}));

vi.mock("../db/client.js", () => {
  const chain = {
    insert: () => chain,
    values: async (row: Record<string, unknown>) => {
      state.insertedRows.push(row);
    },
  };

  return { getDb: () => chain };
});

const { insertKnowledgeSource } = await import("./knowledge-source.repo.js");

describe("insertKnowledgeSource", () => {
  beforeEach(() => {
    state.insertedRows = [];
  });

  it("stores the pasted text as a pending prose knowledge source", async () => {
    const created = await insertKnowledgeSource("Some pasted prose.");

    expect(state.insertedRows).toEqual([
      {
        id: expect.stringMatching(/^ks_/),
        kind: "prose",
        rawText: "Some pasted prose.",
        status: "pending",
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
