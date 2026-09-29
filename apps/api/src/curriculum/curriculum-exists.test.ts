import { describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { curricula } from "../db/schema.js";

const state = vi.hoisted(() => ({
  rows: [] as unknown[],
  lastWhereArgs: [] as unknown[],
}));

vi.mock("../db/client.js", () => {
  const chain = {
    select: () => chain,
    from: () => chain,
    where: (...args: unknown[]) => {
      state.lastWhereArgs = args;

      return state.rows;
    },
  };

  return { getDb: () => chain };
});

const { curriculumExists } = await import("./curriculum-exists.repo.js");

describe("curriculumExists", () => {
  it("filters by the given curriculumId", async () => {
    state.rows = [];

    await curriculumExists("cur_42");

    expect(state.lastWhereArgs).toEqual([eq(curricula.id, "cur_42")]);
  });

  it("returns true when the query resolves a row", async () => {
    state.rows = [{ id: "cur_1" }];

    await expect(curriculumExists("cur_1")).resolves.toBe(true);
  });

  it("returns false when the query resolves no rows", async () => {
    state.rows = [];

    await expect(curriculumExists("cur_missing")).resolves.toBe(false);
  });
});
