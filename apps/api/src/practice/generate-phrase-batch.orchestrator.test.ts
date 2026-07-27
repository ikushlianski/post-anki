import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PhraseBatch } from "./practice-batch.schemas.js";

const mockAgentGenerate = vi.fn();

vi.mock("../mastra/mastra.js", () => ({
  AGENT_KEYS: { phraseBatchGenerate: "phraseBatchGenerate" },
  getMastra: () => ({ getAgent: () => ({ generate: mockAgentGenerate }) }),
}));

vi.mock("../shared/log.js", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const practiceRepoState = { avoidRussian: [] as string[], insertedRows: [] as unknown[] };

const STUB_CREATED_AT = new Date("2026-01-01T00:00:00.000Z");

vi.mock("./practice.repo.js", () => ({
  recentRussianForSubject: vi.fn(async () => practiceRepoState.avoidRussian),
  // insertPhraseBatch now returns the real inserted rows (via drizzle's
  // .returning()) instead of void — the mock must mirror that shape so
  // generatePhraseBatch's own return value (which is now insertPhraseBatch's
  // result, not the pre-insert rows) carries every field the existing
  // assertions below read, plus a real createdAt.
  insertPhraseBatch: vi.fn(async (rows: Record<string, unknown>[]) => {
    practiceRepoState.insertedRows.push(...rows);

    return rows.map((row) => ({ ...row, createdAt: STUB_CREATED_AT }));
  }),
}));

interface FakeEntry {
  id: string;
  phraseText: string;
  status: string;
}

const phraseBankRepoState = {
  dueEntries: [] as FakeEntry[],
  sequenceBase: 0,
  entries: new Map<string, FakeEntry>(),
  createCalls: [] as { id: string; phraseText: string }[],
};

vi.mock("./phrase-bank.repo.js", () => ({
  dueEntriesForScope: vi.fn(async () => phraseBankRepoState.dueEntries),
  nextSequenceBase: vi.fn(async () => phraseBankRepoState.sequenceBase),
  matchExistingEntryId: vi.fn(async (_s: string, _l: string, _p: string, text: string) => {
    const normalized = text.trim().toLowerCase();
    const match = [...phraseBankRepoState.entries.values()].find(
      (e) => e.status !== "mastered" && e.phraseText.trim().toLowerCase() === normalized,
    );

    return match?.id ?? null;
  }),
  createPhraseBankEntry: vi.fn(async (row: { id: string; phraseText: string; category: string | null }) => {
    phraseBankRepoState.entries.set(row.id, { id: row.id, phraseText: row.phraseText, status: "new" });
    phraseBankRepoState.createCalls.push({ id: row.id, phraseText: row.phraseText });
  }),
}));

import { buildPhraseBatchPrompt, toPhraseRows, resolveTargetPhraseBankEntryIds, generatePhraseBatch } from "./generate-phrase-batch.orchestrator.js";

beforeEach(() => {
  vi.clearAllMocks();
  practiceRepoState.avoidRussian = [];
  practiceRepoState.insertedRows = [];
  phraseBankRepoState.dueEntries = [];
  phraseBankRepoState.sequenceBase = 0;
  phraseBankRepoState.entries = new Map();
  phraseBankRepoState.createCalls = [];
});

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

  describe("with due phrases to recycle", () => {
    it("lists each due phrase's id and text and instructs the agent to echo the id", () => {
      const prompt = buildPhraseBatchPrompt("B1_B2", "General", [], 10, [
        { id: "pbentry_1", phraseText: "get to the bottom of" },
      ]);

      expect(prompt).toContain("- id=pbentry_1: get to the bottom of");
      expect(prompt).toContain("echo its id back");
    });

    it("omits the recycling block entirely when nothing is due", () => {
      const prompt = buildPhraseBatchPrompt("B1_B2", "General", [], 10, []);

      expect(prompt).not.toContain("due for recycling");
    });
  });
});

describe("resolveTargetPhraseBankEntryIds", () => {
  describe("a valid echo of a due entry's id", () => {
    it("keeps the id", () => {
      expect(resolveTargetPhraseBankEntryIds(["pbentry_1"], ["pbentry_1"])).toEqual(["pbentry_1"]);
    });
  });

  describe("a hallucinated or stale id not in the due-entry set", () => {
    it("degrades to null instead of being trusted", () => {
      expect(resolveTargetPhraseBankEntryIds(["pbentry_1"], ["pbentry_999"])).toEqual([null]);
    });
  });

  describe("a null echo", () => {
    it("stays null", () => {
      expect(resolveTargetPhraseBankEntryIds(["pbentry_1"], [null])).toEqual([null]);
    });
  });

  describe("two items echoing the same due-entry id", () => {
    it("links only the first occurrence and drops the second to null", () => {
      const resolved = resolveTargetPhraseBankEntryIds(
        ["pbentry_1"],
        ["pbentry_1", "pbentry_1"],
      );

      expect(resolved).toEqual(["pbentry_1", null]);
    });
  });
});

describe("toPhraseRows", () => {
  const GENERATED: PhraseBatch = {
    phrases: [
      {
        russian: "Привет",
        referenceEnglish: "Hey there",
        domain: "SmallTalk",
        targetPhraseBankEntryId: null,
        newTargetPhrase: null,
      },
      {
        russian: "Отчёт готов",
        referenceEnglish: "The report's ready",
        domain: "Tech",
        targetPhraseBankEntryId: null,
        newTargetPhrase: null,
      },
      {
        russian: "Купи молоко",
        referenceEnglish: "Grab some milk",
        domain: "Everyday",
        targetPhraseBankEntryId: null,
        newTargetPhrase: null,
      },
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
        0,
        [null, null, null],
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
        0,
        [null, null, null],
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
        0,
        [null, null, null],
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
        0,
        [null, null, null],
        (index) => `phr_${index}`,
      );

      expect(rows.map((r) => r.id)).toEqual(["phr_0", "phr_1", "phr_2"]);
    });

    it("assigns sequenceNumber as base+1, base+2, ... for the batch", () => {
      const rows = toPhraseRows(
        "sub_1",
        "batch_1",
        "B1_B2",
        "General",
        GENERATED,
        40,
        [null, null, null],
        (index) => `phr_${index}`,
      );

      expect(rows.map((r) => r.sequenceNumber)).toEqual([41, 42, 43]);
    });

    it("carries the resolved targetPhraseBankEntryId per item, defaulting to null", () => {
      const rows = toPhraseRows(
        "sub_1",
        "batch_1",
        "B1_B2",
        "General",
        GENERATED,
        0,
        ["pbentry_1", null, null],
        (index) => `phr_${index}`,
      );

      expect(rows.map((r) => r.targetPhraseBankEntryId)).toEqual(["pbentry_1", null, null]);
    });
  });

  describe("an empty generated batch", () => {
    it("produces no rows", () => {
      const rows = toPhraseRows("sub_1", "batch_1", "B1_B2", "General", { phrases: [] }, 0, [], (index) => `phr_${index}`);

      expect(rows).toEqual([]);
    });
  });
});

describe("generatePhraseBatch", () => {
  describe("a batch with no due phrases (first-ever batch)", () => {
    it("proceeds exactly as today, with no items linked", async () => {
      mockAgentGenerate.mockResolvedValue({
        object: {
          phrases: [
            {
              russian: "Привет",
              referenceEnglish: "Hey there",
              domain: "SmallTalk",
              targetPhraseBankEntryId: null,
              newTargetPhrase: null,
            },
          ],
        },
      });

      const rows = await generatePhraseBatch("sub_1", "B1_B2", "General");

      expect(rows).toHaveLength(1);
      expect(rows[0]!.targetPhraseBankEntryId).toBeNull();
      expect(rows[0]!.sequenceNumber).toBe(1);
      // The returned rows are now insertPhraseBatch's real, post-insert
      // result (via .returning()), not the pre-insert rows — so a real
      // createdAt is present, never undefined/missing.
      expect(rows[0]!.createdAt).toEqual(STUB_CREATED_AT);
    });
  });

  describe("a fixture echoing a due entry's real id", () => {
    it("links the resulting row's targetPhraseBankEntryId to that entry", async () => {
      phraseBankRepoState.dueEntries = [{ id: "pbentry_1", phraseText: "get to the bottom of", status: "practicing" }];
      phraseBankRepoState.sequenceBase = 10;

      mockAgentGenerate.mockResolvedValue({
        object: {
          phrases: [
            {
              russian: "Разберись с этим",
              referenceEnglish: "Get to the bottom of it",
              domain: "Tech",
              targetPhraseBankEntryId: "pbentry_1",
              newTargetPhrase: null,
            },
          ],
        },
      });

      const rows = await generatePhraseBatch("sub_1", "B1_B2", "General");

      expect(rows[0]!.targetPhraseBankEntryId).toBe("pbentry_1");
      expect(rows[0]!.sequenceNumber).toBe(11);
    });
  });

  describe("a fixture echoing an id not present in the due-entry set sent", () => {
    it("inserts the row successfully with targetPhraseBankEntryId null", async () => {
      phraseBankRepoState.dueEntries = [{ id: "pbentry_1", phraseText: "get to the bottom of", status: "practicing" }];

      mockAgentGenerate.mockResolvedValue({
        object: {
          phrases: [
            {
              russian: "Купи молоко",
              referenceEnglish: "Grab some milk",
              domain: "Everyday",
              targetPhraseBankEntryId: "pbentry_hallucinated",
              newTargetPhrase: null,
            },
          ],
        },
      });

      const rows = await generatePhraseBatch("sub_1", "B1_B2", "General");

      expect(rows).toHaveLength(1);
      expect(rows[0]!.targetPhraseBankEntryId).toBeNull();
    });
  });

  describe("two items echoing the same due-entry id in one batch", () => {
    it("links only the first item; the second is untracked", async () => {
      phraseBankRepoState.dueEntries = [{ id: "pbentry_1", phraseText: "get to the bottom of", status: "practicing" }];

      mockAgentGenerate.mockResolvedValue({
        object: {
          phrases: [
            {
              russian: "Разберись с этим",
              referenceEnglish: "Get to the bottom of it",
              domain: "Tech",
              targetPhraseBankEntryId: "pbentry_1",
              newTargetPhrase: null,
            },
            {
              russian: "Ещё раз разберись",
              referenceEnglish: "Get to the bottom of it again",
              domain: "Tech",
              targetPhraseBankEntryId: "pbentry_1",
              newTargetPhrase: null,
            },
          ],
        },
      });

      const rows = await generatePhraseBatch("sub_1", "B1_B2", "General");

      expect(rows.map((r) => r.targetPhraseBankEntryId)).toEqual(["pbentry_1", null]);
      expect(rows).toHaveLength(2);
    });
  });

  describe("an untagged sentence with no notable phrase", () => {
    it("leaves targetPhraseBankEntryId null and creates no bank entry", async () => {
      mockAgentGenerate.mockResolvedValue({
        object: {
          phrases: [
            {
              russian: "Как дела?",
              referenceEnglish: "How's it going?",
              domain: "SmallTalk",
              targetPhraseBankEntryId: null,
              newTargetPhrase: null,
            },
          ],
        },
      });

      await generatePhraseBatch("sub_1", "B1_B2", "General");

      expect(phraseBankRepoState.createCalls).toEqual([]);
    });
  });

  describe("a newly tagged target phrase with no existing match", () => {
    it("creates a new phrase-bank entry and links the row to it", async () => {
      mockAgentGenerate.mockResolvedValue({
        object: {
          phrases: [
            {
              russian: "Разберись с этим",
              referenceEnglish: "Get to the bottom of it",
              domain: "Tech",
              targetPhraseBankEntryId: null,
              newTargetPhrase: { text: "get to the bottom of", category: "idioms" },
            },
          ],
        },
      });

      const rows = await generatePhraseBatch("sub_1", "B1_B2", "General");

      expect(phraseBankRepoState.createCalls).toHaveLength(1);
      expect(rows[0]!.targetPhraseBankEntryId).toBe(phraseBankRepoState.createCalls[0]!.id);
    });
  });
});
