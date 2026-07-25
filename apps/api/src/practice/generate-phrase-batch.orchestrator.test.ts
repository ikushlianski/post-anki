import { describe, it, expect, vi } from "vitest";
import { buildPhraseBatchPrompt, toPhraseRows } from "./generate-phrase-batch.orchestrator.js";
import type { PhraseBatch } from "./practice-batch.schemas.js";

vi.mock("../mastra/mastra.js", () => ({
  AGENT_KEYS: { phraseBatchGenerate: "phraseBatchGenerate" },
  getMastra: () => ({ getAgent: () => ({ generate: vi.fn() }) }),
}));

vi.mock("../shared/log.js", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

describe("buildPhraseBatchPrompt", () => {
  describe("with prior seen sentences to avoid", () => {
    it("includes the level, pack, avoid list, and requested count", () => {
      const prompt = buildPhraseBatchPrompt(
        "B1_B2",
        "StandupUpdates",
        ["Что нового по проекту?", "Есть блокеры?"],
        10,
      );

      expect(prompt).toContain("Level: B1_B2");
      expect(prompt).toContain("Pack: StandupUpdates");
      expect(prompt).toContain("- Что нового по проекту?");
      expect(prompt).toContain("- Есть блокеры?");
      expect(prompt).toContain("Generate exactly 10 items.");
    });
  });

  describe("with no prior sentences", () => {
    it("tells the agent there is nothing to avoid yet", () => {
      const prompt = buildPhraseBatchPrompt("A1_A2", "General", [], 10);

      expect(prompt).toContain("(none yet — this is the first batch for this level/pack)");
    });
  });
});

describe("toPhraseRows", () => {
  const GENERATED: PhraseBatch = {
    phrases: [
      { russian: "Привет", referenceEnglish: "Hey there", domain: "SmallTalk" },
      { russian: "Отчёт готов", referenceEnglish: "The report's ready", domain: "Tech" },
      { russian: "Купи молоко", referenceEnglish: "Grab some milk", domain: "Everyday" },
    ],
  };

  describe("mapping a generated batch to insertable rows", () => {
    it("carries subjectId, batchId, level, and pack onto every row", () => {
      const rows = toPhraseRows(
        "sub_1",
        "batch_1",
        "C1_C2",
        "CodeReview",
        GENERATED,
        (index) => `phr_${index}`,
      );

      for (const row of rows) {
        expect(row.subjectId).toBe("sub_1");
        expect(row.batchId).toBe("batch_1");
        expect(row.level).toBe("C1_C2");
        expect(row.pack).toBe("CodeReview");
      }
    });

    it("assigns a 1-based position matching generation order", () => {
      const rows = toPhraseRows(
        "sub_1",
        "batch_1",
        "B1_B2",
        "General",
        GENERATED,
        (index) => `phr_${index}`,
      );

      expect(rows.map((r) => r.position)).toEqual([1, 2, 3]);
    });

    it("preserves each phrase's russian, referenceEnglish, and domain", () => {
      const rows = toPhraseRows(
        "sub_1",
        "batch_1",
        "B1_B2",
        "General",
        GENERATED,
        (index) => `phr_${index}`,
      );

      expect(rows[0]).toMatchObject({
        russian: "Привет",
        referenceEnglish: "Hey there",
        domain: "SmallTalk",
      });
      expect(rows[2]).toMatchObject({
        russian: "Купи молоко",
        referenceEnglish: "Grab some milk",
        domain: "Everyday",
      });
    });

    it("uses the injected id factory, keyed by index", () => {
      const rows = toPhraseRows(
        "sub_1",
        "batch_1",
        "B1_B2",
        "General",
        GENERATED,
        (index) => `phr_${index}`,
      );

      expect(rows.map((r) => r.id)).toEqual(["phr_0", "phr_1", "phr_2"]);
    });
  });

  describe("an empty generated batch", () => {
    it("produces no rows", () => {
      const rows = toPhraseRows(
        "sub_1",
        "batch_1",
        "B1_B2",
        "General",
        { phrases: [] },
        (index) => `phr_${index}`,
      );

      expect(rows).toEqual([]);
    });
  });
});
