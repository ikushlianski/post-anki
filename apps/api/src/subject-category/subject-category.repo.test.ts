import { beforeEach, describe, expect, it, vi } from "vitest";

type CategoryRow = {
  id: string;
  subjectId: string;
  parentId: string | null;
  name: string;
};

const state = vi.hoisted(() => ({
  selectRows: [] as CategoryRow[],
  patch: undefined as Record<string, unknown> | undefined,
  mode: "select" as "select" | "update",
}));

vi.mock("../db/client.js", () => {
  const chain: {
    select: () => typeof chain;
    from: () => typeof chain;
    update: () => typeof chain;
    set: (patch: unknown) => typeof chain;
    where: () => typeof chain | CategoryRow[];
  } = {
    select: () => {
      state.mode = "select";

      return chain;
    },
    from: () => chain,
    update: () => {
      state.mode = "update";

      return chain;
    },
    set: (patch: unknown) => {
      state.patch = patch as Record<string, unknown>;

      return chain;
    },
    where: () => {
      if (state.mode === "select") {
        return state.selectRows;
      }

      return chain;
    },
  };

  return { getDb: () => chain };
});

const { renameCategory } = await import("./subject-category.repo.js");

function makeRow(overrides: Partial<CategoryRow> = {}): CategoryRow {
  return {
    id: "cat_1",
    subjectId: "sub_1",
    parentId: null,
    name: "Backend",
    ...overrides,
  };
}

describe("renameCategory", () => {
  beforeEach(() => {
    state.selectRows = [];
    state.patch = undefined;
    state.mode = "select";
  });

  it("renames a category by setting the name column", async () => {
    state.selectRows = [makeRow()];

    const result = await renameCategory("cat_1", "Server-side");

    expect(result).not.toHaveProperty("error");
    if ("error" in result) {
      return;
    }

    expect(state.patch).toEqual({ name: "Server-side" });
    expect(result.name).toBe("Server-side");
  });

  it("returns category_not_found when the category does not exist", async () => {
    state.selectRows = [];

    const result = await renameCategory("cat_missing", "Anything");

    expect(result).toEqual({ error: "category_not_found" });
  });
});
