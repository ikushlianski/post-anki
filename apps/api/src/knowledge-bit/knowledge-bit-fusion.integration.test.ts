import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { startApprovalTestDatabase } from "./knowledge-bit-approval.integration-helpers.js";
import { RU_SOURCE_TEXT } from "./knowledge-bit-source-items.test-mocks.js";
import type { LessonDraft } from "./knowledge-bit-source-item-validation.js";

vi.mock("../admin-settings/admin-settings.repo.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../admin-settings/admin-settings.repo.js")>()),
  getTriageEnabled: async () => true,
}));

vi.mock("./knowledge-bit-duplicate-gate.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./knowledge-bit-duplicate-gate.js")>()),
  dropDuplicateCards: async (_db: unknown, lessons: readonly unknown[]) => ({ lessons: [...lessons], skippedCards: 0 }),
}));

vi.mock("../shared/log.js", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

const database = await startApprovalTestDatabase();
const client = database.client;

const { generateItemsForSource, defaultGenerateItemsDeps } = await import("./detect-knowledge-bits.orchestrator.js");
const { listPendingKnowledgeBitsForReview } = await import("./knowledge-bit-pending-list.repo.js");

afterAll(database.teardown);

const MODELS = ["openrouter/openai/gpt-6-luna", "openrouter/anthropic/claude-haiku-5.5"];
const QUOTE = "нам не обязательно искать боли клиента";

function draft(statement: string): LessonDraft {
  return {
    statement,
    quote: QUOTE,
    example: null,
    cards: [{ kind: "basic", statement, question: `${statement}?`, answer: "Ответ на вопрос", quote: QUOTE }],
  };
}

async function seedProcessingSource(): Promise<{ id: string; claimedAt: Date }> {
  const id = `ksrc_${randomUUID()}`;
  const claimedAt = new Date();

  await client.query(
    `INSERT INTO knowledge_sources (id, kind, raw_text, status, updated_at) VALUES ($1, 'prose', $2, 'processing', $3)`,
    [id, RU_SOURCE_TEXT, claimedAt],
  );

  return { id, claimedAt };
}

async function extract(fusionModelIds: string[], writer: (modelId: string | undefined) => LessonDraft[]) {
  const seeded = await seedProcessingSource();
  const deps = {
    ...defaultGenerateItemsDeps(),
    writeItems: vi.fn(async (_chunk: string, options: { modelId?: string }) => writer(options.modelId)),
    loadFusionModelIds: async () => fusionModelIds,
  };
  const result = await generateItemsForSource(
    { id: seeded.id, rawText: RU_SOURCE_TEXT, extractionModelId: null, subjectId: null, claimedAt: seeded.claimedAt },
    {},
    deps,
  );
  const pending = await listPendingKnowledgeBitsForReview(100);
  const bits = pending.find((entry) => entry.knowledgeSourceId === seeded.id)?.bits ?? [];

  return { result, bits, deps };
}

describe("fusion extraction (real Postgres, mocked model)", () => {
  it("should store one pending card per distinct statement credited to every model that wrote it", async () => {
    const { result, bits, deps } = await extract(MODELS, (modelId) => [
      draft("Покупку софта запускает видение будущего клиента"),
      ...(modelId === MODELS[1] ? [draft("Руководство компании само решает купить софт")] : []),
    ]);

    expect(result.status).toBe("detected");
    expect(deps.writeItems).toHaveBeenCalledTimes(2);

    const byBody = new Map(bits.map((bit) => [bit.body, bit.modelIds]));

    expect(bits).toHaveLength(2);
    expect(byBody.get("Покупку софта запускает видение будущего клиента")).toEqual([...MODELS].sort());
    expect(byBody.get("Руководство компании само решает купить софт")).toEqual([MODELS[1]]);
  });

  it("should keep the cards of the working model when the other model fails", async () => {
    const { result, bits } = await extract(MODELS, (modelId) => {
      if (modelId === MODELS[0]) {
        throw new Error("provider down");
      }

      return [draft("Покупку софта запускает видение будущего клиента")];
    });

    expect(result.status).toBe("detected");
    expect(bits.map((bit) => bit.modelIds)).toEqual([[MODELS[1]]]);
  });

  it("should write no model credits and call the model once when fusion is off", async () => {
    const { result, bits, deps } = await extract([], () => [draft("Покупку софта запускает видение будущего клиента")]);

    expect(result.status).toBe("detected");
    expect(deps.writeItems).toHaveBeenCalledTimes(1);
    expect(bits.map((bit) => bit.modelIds)).toEqual([[]]);

    const credits = await client.query(`SELECT count(*)::int AS n FROM knowledge_bit_fusion_models WHERE bit_id = $1`, [bits[0]!.id]);

    expect(credits.rows[0].n).toBe(0);
  });
});
