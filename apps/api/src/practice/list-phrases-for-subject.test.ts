import { describe, expect, it, vi } from "vitest";
import { asc, eq } from "drizzle-orm";
import { phrases } from "../db/schema.js";

const state = vi.hoisted(() => ({
  rows: [] as unknown[],
  lastWhereArgs: [] as unknown[],
  lastOrderByArgs: [] as unknown[],
}));

vi.mock("../db/client.js", () => {
  const chain = {
    select: () => chain,
    from: () => chain,
    where: (...args: unknown[]) => {
      state.lastWhereArgs = args;

      return chain;
    },
    orderBy: (...args: unknown[]) => {
      state.lastOrderByArgs = args;

      return state.rows;
    },
  };

  return { getDb: () => chain };
});

const { listPhrasesForSubject } = await import("./practice.repo.js");

describe("listPhrasesForSubject", () => {
  it("filters by the given subjectId", async () => {
    state.rows = [];

    await listPhrasesForSubject("sub_42");

    expect(state.lastWhereArgs).toEqual([eq(phrases.subjectId, "sub_42")]);
  });

  it("orders by level, pack, sequenceNumber, id — the unique index's own column order — so a multi-pack deck pages stably", async () => {
    state.rows = [];

    await listPhrasesForSubject("sub_1");

    expect(state.lastOrderByArgs).toEqual([
      asc(phrases.level),
      asc(phrases.pack),
      asc(phrases.sequenceNumber),
      asc(phrases.id),
    ]);
  });

  it("returns the rows the query resolves", async () => {
    state.rows = [
      { id: "phrase_1", subjectId: "sub_1", sequenceNumber: 1 },
      { id: "phrase_2", subjectId: "sub_1", sequenceNumber: 2 },
    ];

    const rows = await listPhrasesForSubject("sub_1");

    expect(rows).toEqual(state.rows);
  });
});
