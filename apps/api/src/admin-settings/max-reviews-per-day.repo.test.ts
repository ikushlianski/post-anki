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

const { getAdminSettings, getMaxReviewsPerDay, updateAdminSettings } = await import(
  "./admin-settings.repo.js"
);

function makeRow(maxReviewsPerDay: number) {
  return {
    id: "app",
    testToggle: false,
    modelTier: "cheap",
    knowledgeItemModelId: "openrouter/anthropic/claude-haiku-5.5",
    newCardsPerDay: 20,
    maxReviewsPerDay,
    fusionEnabled: false,
    fusionModelIds: [],
  };
}

describe("daily review limit setting", () => {
  beforeEach(() => {
    state.rows = [];
    state.inserted = undefined;
  });

  it("should allow 200 reviews a day when the learner never saved a limit", async () => {
    expect(await getMaxReviewsPerDay()).toBe(200);
    expect((await getAdminSettings()).maxReviewsPerDay).toBe(200);
  });

  it("should read the stored limit and treat 0 as unlimited", async () => {
    state.rows = [{ maxReviewsPerDay: 0 }];

    expect(await getMaxReviewsPerDay()).toBe(0);
  });

  it("should save a new limit and keep the other settings", async () => {
    state.rows = [makeRow(200)];

    const updated = await updateAdminSettings({ maxReviewsPerDay: 80 });

    expect(state.inserted).toMatchObject({ maxReviewsPerDay: 80, newCardsPerDay: 20 });
    expect(updated.maxReviewsPerDay).toBe(80);
  });

  it("should keep the stored limit when only another setting changes", async () => {
    state.rows = [makeRow(75)];

    const updated = await updateAdminSettings({ testToggle: true });

    expect(state.inserted).toMatchObject({ maxReviewsPerDay: 75 });
    expect(updated.maxReviewsPerDay).toBe(75);
  });
});
