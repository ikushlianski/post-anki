import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  inserted: undefined as Record<string, unknown> | undefined,
}));

vi.mock("../db/client.js", () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ where: async () => state.rows }) }),
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        state.inserted = values;

        return { onConflictDoNothing: async () => undefined, onConflictDoUpdate: async () => undefined };
      },
    }),
  }),
}));

vi.mock("../shared/log.js", () => ({
  log: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { getAdminSettings, getNewCardsPerDay, updateAdminSettings } = await import(
  "./admin-settings.repo.js"
);

function makeRow(newCardsPerDay: number) {
  return {
    id: "app",
    testToggle: false,
    modelTier: "cheap",
    knowledgeItemModelId: "openrouter/anthropic/claude-haiku-5.5",
    newCardsPerDay,
  };
}

describe("daily new-card limit setting", () => {
  beforeEach(() => {
    state.rows = [];
    state.inserted = undefined;
  });

  it("should be 20 when the learner has never saved a limit", async () => {
    expect(await getNewCardsPerDay()).toBe(20);
    expect((await getAdminSettings()).newCardsPerDay).toBe(20);
  });

  it("should read the stored limit", async () => {
    state.rows = [{ newCardsPerDay: 35 }];

    expect(await getNewCardsPerDay()).toBe(35);
  });

  it.each([
    [0, 1],
    [5000, 200],
  ])("should clamp a stored %s to %s when reading it for the queue", async (stored, expected) => {
    state.rows = [{ newCardsPerDay: stored }];

    expect(await getNewCardsPerDay()).toBe(expected);
  });

  it("should save a new limit and keep the other settings", async () => {
    state.rows = [makeRow(20)];

    const updated = await updateAdminSettings({ newCardsPerDay: 50 });

    expect(state.inserted).toMatchObject({ newCardsPerDay: 50, modelTier: "cheap" });
    expect(updated.newCardsPerDay).toBe(50);
  });

  it("should keep the stored limit when only another setting changes", async () => {
    state.rows = [makeRow(42)];

    const updated = await updateAdminSettings({ testToggle: true });

    expect(state.inserted).toMatchObject({ newCardsPerDay: 42, testToggle: true });
    expect(updated.newCardsPerDay).toBe(42);
  });
});
