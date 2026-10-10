import { beforeEach, describe, expect, it, vi } from "vitest";

type SubjectRow = {
  id: string;
  name: string;
  description: string | null;
  requireSources: boolean;
  kind: string;
  modelTier: string | null;
  parentId: string | null;
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
  };

  return { getDb: () => chain };
});

const { updateSubject } = await import("./subject.repo.js");

function makeRow(overrides: Partial<SubjectRow> = {}): SubjectRow {
  return {
    id: "sub_1",
    name: "Architecture Patterns",
    description: null,
    requireSources: true,
    kind: "architecture-mentor",
    modelTier: null,
    parentId: null,
    ...overrides,
  };
}

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
