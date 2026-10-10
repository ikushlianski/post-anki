import { beforeEach, describe, expect, it, vi } from "vitest";

type SettingsRow = {
  id: string;
  testToggle: boolean;
  modelTier: string;
  knowledgeItemModelId: string;
};

const state = vi.hoisted(() => ({
  rows: [] as SettingsRow[],
  inserted: undefined as Record<string, unknown> | undefined,
}));

vi.mock("../db/client.js", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: async () => state.rows,
      }),
    }),
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        state.inserted = values;

        return {
          onConflictDoNothing: async () => undefined,
          onConflictDoUpdate: async () => undefined,
        };
      },
    }),
  }),
}));

vi.mock("../shared/log.js", () => ({
  log: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { getAdminSettings, updateAdminSettings, getKnowledgeItemModelId } = await import(
  "./admin-settings.repo.js"
);
const { log } = await import("../shared/log.js");

function makeRow(overrides: Partial<SettingsRow> = {}): SettingsRow {
  return {
    id: "app",
    testToggle: false,
    modelTier: "cheap",
    knowledgeItemModelId: "openrouter/openai/gpt-oss-20b",
    ...overrides,
  };
}

describe("getAdminSettings", () => {
  beforeEach(() => {
    state.rows = [];
    state.inserted = undefined;
    vi.mocked(log.warn).mockClear();
  });

  it("should default the knowledge-item model when no settings row exists yet", async () => {
    const settings = await getAdminSettings();

    expect(settings.knowledgeItemModelId).toBe("openrouter/deepseek/deepseek-v4-flash");
  });

  it("should return the stored knowledge-item model when it is on the allowlist", async () => {
    state.rows = [makeRow()];

    const settings = await getAdminSettings();

    expect(settings.knowledgeItemModelId).toBe("openrouter/openai/gpt-oss-20b");
  });

  it("should fall back to the default and log a warning when the stored model is unknown", async () => {
    state.rows = [makeRow({ knowledgeItemModelId: "openrouter/deepseek/deepseek-v4-pro" })];

    const settings = await getAdminSettings();

    expect(settings.knowledgeItemModelId).toBe("openrouter/deepseek/deepseek-v4-flash");
    expect(log.warn).toHaveBeenCalledWith(
      { storedModelId: "openrouter/deepseek/deepseek-v4-pro" },
      "knowledge_item_model_id_unknown_fallback_default",
    );
  });
});

describe("getKnowledgeItemModelId", () => {
  beforeEach(() => {
    state.rows = [];
  });

  it("should read the stored knowledge-item model for a run", async () => {
    state.rows = [makeRow({ knowledgeItemModelId: "openrouter/mistralai/mistral-nemo" })];

    expect(await getKnowledgeItemModelId()).toBe("openrouter/mistralai/mistral-nemo");
  });
});

describe("updateAdminSettings", () => {
  beforeEach(() => {
    state.rows = [makeRow()];
    state.inserted = undefined;
  });

  it("should persist a new knowledge-item model and return it", async () => {
    const updated = await updateAdminSettings({
      knowledgeItemModelId: "openrouter/inclusionai/ling-3.0-flash-vl",
    });

    expect(state.inserted).toMatchObject({
      knowledgeItemModelId: "openrouter/inclusionai/ling-3.0-flash-vl",
      modelTier: "cheap",
    });
    expect(updated.knowledgeItemModelId).toBe("openrouter/inclusionai/ling-3.0-flash-vl");
  });

  it("should keep the stored knowledge-item model when only the test toggle changes", async () => {
    const updated = await updateAdminSettings({ testToggle: true });

    expect(state.inserted).toMatchObject({
      testToggle: true,
      knowledgeItemModelId: "openrouter/openai/gpt-oss-20b",
    });
    expect(updated.knowledgeItemModelId).toBe("openrouter/openai/gpt-oss-20b");
  });
});
