import { beforeEach, describe, expect, it, vi } from "vitest";

type SubjectRow = {
  id: string;
  name: string;
  description: string | null;
  requireSources: boolean;
  kind: string;
  modelTier: string | null;
  parentId: string | null;
  sortOrder: number | null;
  learningIntent?: string | null;
};

const state = vi.hoisted(() => ({
  selectRows: [] as SubjectRow[],
  updateRows: [] as SubjectRow[],
  patch: undefined as Record<string, unknown> | undefined,
  mode: "select" as "select" | "update",
}));

vi.mock("../db/client.js", () => {
  const chain: {
    select: () => typeof chain;
    from: () => typeof chain;
    update: () => typeof chain;
    set: (patch: unknown) => typeof chain;
    where: () => typeof chain | SubjectRow[];
    returning: () => SubjectRow[];
    transaction: <T>(run: (tx: typeof chain) => Promise<T>) => Promise<T>;
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
    returning: () => state.updateRows,
    transaction: (run) => run(chain),
  };

  return { getDb: () => chain };
});

const { getSubject, updateSubject } = await import("./subject.repo.js");

function makeRow(overrides: Partial<SubjectRow> = {}): SubjectRow {
  return {
    id: "sub_1",
    name: "Architecture Patterns",
    description: null,
    requireSources: true,
    kind: "architecture-mentor",
    modelTier: null,
    parentId: null,
    sortOrder: null,
    ...overrides,
  };
}

describe("getSubject", () => {
  beforeEach(() => {
    state.selectRows = [];
    state.mode = "select";
  });

  it("should expose the stored sort order so the dashboard keeps sibling order", async () => {
    state.selectRows = [makeRow({ sortOrder: 3 })];

    const subject = await getSubject("sub_1");

    expect(subject?.sortOrder).toBe(3);
  });

  it("should report a null sort order for a subject that was never reordered", async () => {
    state.selectRows = [makeRow({ sortOrder: null })];

    const subject = await getSubject("sub_1");

    expect(subject?.sortOrder).toBeNull();
  });
});

describe("updateSubject", () => {
  beforeEach(() => {
    state.selectRows = [];
    state.updateRows = [];
    state.patch = undefined;
    state.mode = "select";
  });

  it("renames a subject by setting only the name column", async () => {
    state.updateRows = [makeRow({ name: "Renamed Patterns" })];

    const updated = await updateSubject("sub_1", { name: "Renamed Patterns" });

    expect(state.patch).toEqual({ name: "Renamed Patterns" });
    expect(updated).toMatchObject({ ok: true, subject: { name: "Renamed Patterns" } });
  });

  it("stores a trimmed learning intent", async () => {
    state.updateRows = [makeRow({ learningIntent: "Apply sales rules" })];

    const updated = await updateSubject("sub_1", { learningIntent: "  Apply sales rules  " });

    expect(state.patch).toEqual({ learningIntent: "Apply sales rules" });
    expect(updated).toMatchObject({ ok: true, subject: { learningIntent: "Apply sales rules" } });
  });

  it("clears the learning intent so the subject inherits again when the text is empty", async () => {
    state.updateRows = [makeRow({ learningIntent: null })];

    const updated = await updateSubject("sub_1", { learningIntent: "" });

    expect(state.patch).toEqual({ learningIntent: null });
    expect(updated).toMatchObject({ ok: true, subject: { learningIntent: null } });
  });

  it("keeps updating the model tier without touching the name", async () => {
    state.updateRows = [makeRow({ modelTier: "cheap" })];

    const updated = await updateSubject("sub_1", { modelTier: "cheap" });

    expect(state.patch).toEqual({ modelTier: "cheap" });
    expect(updated).toMatchObject({ ok: true, subject: { modelTier: "cheap" } });
  });

  it("applies name and model tier together in one update", async () => {
    state.updateRows = [makeRow({ name: "Renamed", modelTier: "premium" })];

    await updateSubject("sub_1", { name: "Renamed", modelTier: "premium" });

    expect(state.patch).toEqual({ name: "Renamed", modelTier: "premium" });
  });

  it("returns the existing subject without writing when no field is provided", async () => {
    state.selectRows = [makeRow()];

    const updated = await updateSubject("sub_1", {});

    expect(state.patch).toBeUndefined();
    expect(updated).toMatchObject({ ok: true, subject: { name: "Architecture Patterns" } });
  });

  it("returns null when the subject does not exist", async () => {
    state.updateRows = [];

    const updated = await updateSubject("sub_missing", { name: "Nobody" });

    expect(updated).toEqual({ ok: true, subject: null });
  });
});
