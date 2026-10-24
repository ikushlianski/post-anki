import type { Env } from "../shared/env.js";
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
const { dynamicKnowledgeItemModel } = await import("../mastra/model.js");

function makeRow(overrides: Partial<SettingsRow> = {}): SettingsRow {
  return {
    id: "app",
    testToggle: false,
    modelTier: "cheap",
    knowledgeItemModelId: "openrouter/openai/gpt-4o-mini",
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

    expect(settings.knowledgeItemModelId).toBe("openrouter/anthropic/claude-haiku-5.5");
  });

  it("should store the default knowledge-item model when it creates the settings row", async () => {
    await getAdminSettings();

    expect(state.inserted).toMatchObject({ knowledgeItemModelId: "openrouter/anthropic/claude-haiku-5.5" });
  });

  it("should return the stored knowledge-item model when it is on the allowlist", async () => {
    state.rows = [makeRow()];

    const settings = await getAdminSettings();

    expect(settings.knowledgeItemModelId).toBe("openrouter/openai/gpt-4o-mini");
  });

  it("should fall back to the default and log a warning when the stored model is unknown", async () => {
    state.rows = [makeRow({ knowledgeItemModelId: "openrouter/deepseek/deepseek-v4-flash" })];

    const settings = await getAdminSettings();

    expect(settings.knowledgeItemModelId).toBe("openrouter/anthropic/claude-haiku-5.5");
    expect(log.warn).toHaveBeenCalledWith(
      { storedModelId: "openrouter/deepseek/deepseek-v4-flash" },
      "knowledge_item_model_id_unknown_fallback_default",
    );
  });
});

describe("stored knowledge-item model that was removed from the allowlist", () => {
  beforeEach(() => {
    state.inserted = undefined;
    vi.mocked(log.warn).mockClear();
  });

  it.each([
    "openrouter/google/gemma-3-12b-it",
    "openrouter/mistralai/mistral-small-24b-instruct-2501",
    "openrouter/deepseek/deepseek-v4-flash",
  ])("should fall back to the default and log a warning when the stored model is %s", async (storedId) => {
    state.rows = [makeRow({ knowledgeItemModelId: storedId })];

    const settings = await getAdminSettings();

    expect(settings.knowledgeItemModelId).toBe("openrouter/anthropic/claude-haiku-5.5");
    expect(log.warn).toHaveBeenCalledWith(
      { storedModelId: storedId },
      "knowledge_item_model_id_unknown_fallback_default",
    );
    expect(state.inserted).toBeUndefined();
  });
});

describe("getKnowledgeItemModelId", () => {
  beforeEach(() => {
    state.rows = [];
  });

  it("should read the stored knowledge-item model for a run", async () => {
    state.rows = [makeRow({ knowledgeItemModelId: "openrouter/openai/gpt-oss-120b" })];

    expect(await getKnowledgeItemModelId()).toBe("openrouter/openai/gpt-oss-120b");
  });
});

describe("stored knowledge-item model that is no longer on the allowlist", () => {
  beforeEach(() => {
    state.rows = [makeRow({ knowledgeItemModelId: "openrouter/deepseek/deepseek-v4-flash" })];
    state.inserted = undefined;
    vi.mocked(log.warn).mockClear();
  });

  it("should fall back to the default for a run without writing the stored row", async () => {
    expect(await getKnowledgeItemModelId()).toBe("openrouter/anthropic/claude-haiku-5.5");
    expect(state.inserted).toBeUndefined();
  });

  it("should fall back to the default in the model resolver used by the writers", async () => {
    const resolveModel = dynamicKnowledgeItemModel({ OPENROUTER_BASE_URL: undefined } as unknown as Env);

    expect(await resolveModel({})).toBe("openrouter/anthropic/claude-haiku-5.5");
    expect(state.inserted).toBeUndefined();
  });
});

describe("updateAdminSettings", () => {
  beforeEach(() => {
    state.rows = [makeRow()];
    state.inserted = undefined;
  });

  it("should persist a new knowledge-item model and return it", async () => {
    const updated = await updateAdminSettings({
      knowledgeItemModelId: "openrouter/google/gemma-4-31b-it",
    });

    expect(state.inserted).toMatchObject({
      knowledgeItemModelId: "openrouter/google/gemma-4-31b-it",
      modelTier: "cheap",
    });
    expect(updated.knowledgeItemModelId).toBe("openrouter/google/gemma-4-31b-it");
  });

  it("should keep the stored knowledge-item model when only the test toggle changes", async () => {
    const updated = await updateAdminSettings({ testToggle: true });

    expect(state.inserted).toMatchObject({
      testToggle: true,
      knowledgeItemModelId: "openrouter/openai/gpt-4o-mini",
    });
    expect(updated.knowledgeItemModelId).toBe("openrouter/openai/gpt-4o-mini");
  });
});
