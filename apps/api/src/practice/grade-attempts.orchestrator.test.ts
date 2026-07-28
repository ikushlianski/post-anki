import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GradeBatch } from "./practice-batch.schemas.js";
import type { PhraseBankEntryState } from "@post-anki/core";
import type { DuePhraseBankEntry } from "./phrase-bank.repo.js";

const mockAgentGenerate = vi.fn();

vi.mock("../mastra/mastra.js", () => ({
  AGENT_KEYS: { gradeBatch: "gradeBatch" },
  getMastra: () => ({ getAgent: () => ({ generate: mockAgentGenerate }) }),
}));

vi.mock("../shared/log.js", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

// applyPhraseBankUpdates now opens getDb().transaction(...) directly (the
// FOR UPDATE write path) rather than only calling already-mocked repo
// functions — this stand-in just invokes the callback with a dummy `tx`
// object, since every repo function called with it below is itself already
// mocked and doesn't inspect the executor it's given. Signature-shape update
// only; no assertion below changes.
vi.mock("../db/client.js", () => ({
  getDb: () => ({
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({}),
  }),
}));

interface FakePhrase {
  id: string;
  russian: string;
  referenceEnglish: string;
  targetPhraseBankEntryId: string | null;
  sequenceNumber: number;
}

const practiceRepoState = {
  phrases: new Map<string, FakePhrase>(),
  insertedAttempts: [] as unknown[],
};

vi.mock("./practice.repo.js", () => ({
  getPhrasesByIds: vi.fn(async (ids: string[]) =>
    ids.map((id) => practiceRepoState.phrases.get(id)).filter((p): p is FakePhrase => Boolean(p)),
  ),
  insertAttempts: vi.fn(async (rows: unknown[]) => {
    practiceRepoState.insertedAttempts.push(...rows);
  }),
}));

type FakeBankEntry = DuePhraseBankEntry;

const phraseBankRepoState = {
  entries: new Map<string, FakeBankEntry>(),
  updateCalls: [] as { id: string; next: PhraseBankEntryState; options: { correct: boolean; justMastered: boolean } }[],
  appearanceCalls: [] as unknown[],
};

vi.mock("./phrase-bank.repo.js", () => ({
  getPhraseBankEntriesByIdsForUpdate: vi.fn(async (ids: string[]) =>
    ids
      .map((id) => phraseBankRepoState.entries.get(id))
      .filter((e): e is FakeBankEntry => Boolean(e)),
  ),
  toEntryState: (row: FakeBankEntry) => row,
  updatePhraseBankEntryAfterAttempt: vi.fn(
    async (id: string, next: FakeBankEntry, options: { correct: boolean; justMastered: boolean }) => {
      phraseBankRepoState.entries.set(id, { ...next, id });
      phraseBankRepoState.updateCalls.push({ id, next, options });
    },
  ),
  insertPhraseBankAppearance: vi.fn(async (row: unknown) => {
    phraseBankRepoState.appearanceCalls.push(row);
  }),
}));

import {
  buildGradeBatchPrompt,
  toAttemptRows,
  applyPhraseBankAttempts,
  gradeAttempts,
  type GradeItem,
  type PhraseBankAttemptInput,
} from "./grade-attempts.orchestrator.js";

beforeEach(() => {
  vi.clearAllMocks();
  practiceRepoState.phrases = new Map();
  practiceRepoState.insertedAttempts = [];
  phraseBankRepoState.entries = new Map();
  phraseBankRepoState.updateCalls = [];
  phraseBankRepoState.appearanceCalls = [];
});

function baseEntry(overrides: Partial<FakeBankEntry> = {}): FakeBankEntry {
  return {
    id: "pbentry_1",
    phraseText: "get to the bottom of",
    category: "idioms",
    status: "practicing",
    masteryStage: 0,
    correctCountInCycle: 0,
    incorrectCountInCycle: 0,
    lastCorrectAtSentenceCount: null,
    scheduledForSentenceCount: null,
    ...overrides,
  };
}

describe("buildGradeBatchPrompt", () => {
  describe("with multiple items", () => {
    const items: GradeItem[] = [
      { russian: "Привет", referenceEnglish: "Hey there", userAnswer: "Hi" },
      { russian: "Пока", referenceEnglish: "See ya", userAnswer: "Bye bye" },
    ];

    it("includes the level and every item in order, numbered from 1", () => {
      const prompt = buildGradeBatchPrompt("B1_B2", items);

      expect(prompt).toContain("Level: B1_B2");
      expect(prompt).toContain("Item 1:");
      expect(prompt).toContain("Russian: Привет");
      expect(prompt).toContain("Reference native translation: Hey there");
      expect(prompt).toContain("Learner's answer: Hi");
      expect(prompt).toContain("Item 2:");
      expect(prompt).toContain("Russian: Пока");
      expect(prompt).toContain("Learner's answer: Bye bye");
    });

    it("instructs the agent to grade in order and return the same count", () => {
      const prompt = buildGradeBatchPrompt("B1_B2", items);

      expect(prompt).toContain("Grade each item independently, in the same order given");
      expect(prompt).toContain("Return exactly 2 graded results, in the same order.");
    });

    it("places item 1 before item 2 in the rendered prompt", () => {
      const prompt = buildGradeBatchPrompt("B1_B2", items);

      expect(prompt.indexOf("Item 1:")).toBeLessThan(prompt.indexOf("Item 2:"));
    });
  });
});

describe("toAttemptRows", () => {
  const ORIGINAL_ANSWERS = [
    { phraseId: "phr_a", userAnswer: "Hi there" },
    { phraseId: "phr_b", userAnswer: "See ya later" },
    { phraseId: "phr_c", userAnswer: "Grab some milk" },
  ];

  const GRADED: GradeBatch = {
    gradedAnswers: [
      { score: 9, verdict: "Ok", feedback: "Natural.", nativeAlternatives: ["Hey!"] },
      { score: 6, verdict: "NeedsReview", feedback: "A bit stiff.", nativeAlternatives: ["Later!", "Catch ya later"] },
      { score: 3, verdict: "NeedsDeepDive", feedback: "Wrong meaning.", nativeAlternatives: ["Pick up some milk"] },
    ],
  };

  describe("reattaching grades to phrases positionally", () => {
    it("zips each graded answer with the original answer at the same index", () => {
      const rows = toAttemptRows("sub_1", GRADED, ORIGINAL_ANSWERS, (index) => `att_${index}`);

      expect(rows).toEqual([
        {
          id: "att_0",
          subjectId: "sub_1",
          phraseId: "phr_a",
          userAnswer: "Hi there",
          score: 9,
          verdict: "Ok",
          feedback: "Natural.",
          nativeAlternatives: ["Hey!"],
        },
        {
          id: "att_1",
          subjectId: "sub_1",
          phraseId: "phr_b",
          userAnswer: "See ya later",
          score: 6,
          verdict: "NeedsReview",
          feedback: "A bit stiff.",
          nativeAlternatives: ["Later!", "Catch ya later"],
        },
        {
          id: "att_2",
          subjectId: "sub_1",
          phraseId: "phr_c",
          userAnswer: "Grab some milk",
          score: 3,
          verdict: "NeedsDeepDive",
          feedback: "Wrong meaning.",
          nativeAlternatives: ["Pick up some milk"],
        },
      ]);
    });

    it("does not attribute a grade to the wrong phrase when scores are unsorted relative to order", () => {
      const rows = toAttemptRows("sub_1", GRADED, ORIGINAL_ANSWERS, (index) => `att_${index}`);

      const byPhrase = new Map(rows.map((r) => [r.phraseId, r]));

      expect(byPhrase.get("phr_a")!.score).toBe(9);
      expect(byPhrase.get("phr_b")!.score).toBe(6);
      expect(byPhrase.get("phr_c")!.score).toBe(3);
    });
  });

  describe("when the agent returns fewer graded answers than submitted", () => {
    it("only produces rows for the answers that were actually graded", () => {
      const partial: GradeBatch = { gradedAnswers: [GRADED.gradedAnswers[0]!] };
      const rows = toAttemptRows("sub_1", partial, ORIGINAL_ANSWERS, (index) => `att_${index}`);

      expect(rows).toHaveLength(1);
      expect(rows[0]!.phraseId).toBe("phr_a");
    });
  });

  describe("when the agent returns more graded answers than submitted", () => {
    it("ignores the extra graded answers", () => {
      const twoAnswers = ORIGINAL_ANSWERS.slice(0, 2);
      const rows = toAttemptRows("sub_1", GRADED, twoAnswers, (index) => `att_${index}`);

      expect(rows).toHaveLength(2);
      expect(rows.map((r) => r.phraseId)).toEqual(["phr_a", "phr_b"]);
    });
  });

  describe("with no answers submitted", () => {
    it("produces no rows", () => {
      const rows = toAttemptRows("sub_1", GRADED, [], (index) => `att_${index}`);

      expect(rows).toEqual([]);
    });
  });
});

describe("applyPhraseBankAttempts", () => {
  describe("an entry that no longer resolves (defensive failure mode)", () => {
    it("is skipped rather than crashing the whole batch", () => {
      const inputs: PhraseBankAttemptInput[] = [
        { phraseBankEntryId: "missing", phraseId: "phr_1", sequenceNumber: 1, verdict: "Ok", score: 9 },
      ];

      const outcomes = applyPhraseBankAttempts(inputs, new Map());

      expect(outcomes).toEqual([]);
    });
  });

  describe("a correct verdict against a practicing entry", () => {
    it("advances the mastery counter via the deriver, not an independent copy of the rule", () => {
      const entries = new Map([["pbentry_1", baseEntry()]]);
      const inputs: PhraseBankAttemptInput[] = [
        { phraseBankEntryId: "pbentry_1", phraseId: "phr_1", sequenceNumber: 1, verdict: "Ok", score: 9 },
      ];

      const [outcome] = applyPhraseBankAttempts(inputs, entries);

      expect(outcome!.nextEntry.masteryStage).toBe(1);
      expect(outcome!.appearance).toMatchObject({
        phraseBankEntryId: "pbentry_1",
        phraseId: "phr_1",
        sentenceCount: 1,
        result: "correct",
        score: 9,
      });
    });
  });

  describe("an incorrect verdict against a practicing entry", () => {
    it("rolls back to struggling", () => {
      const entries = new Map([["pbentry_1", baseEntry({ masteryStage: 1, correctCountInCycle: 1 })]]);
      const inputs: PhraseBankAttemptInput[] = [
        { phraseBankEntryId: "pbentry_1", phraseId: "phr_1", sequenceNumber: 4, verdict: "NeedsDeepDive", score: 2 },
      ];

      const [outcome] = applyPhraseBankAttempts(inputs, entries);

      expect(outcome!.nextEntry).toMatchObject({ status: "struggling", masteryStage: 0 });
      expect(outcome!.appearance.result).toBe("incorrect");
    });
  });

  describe("two inputs targeting the same entry in one grading pass", () => {
    it("has the second input see the first's already-updated state", () => {
      const entries = new Map([["pbentry_1", baseEntry({ status: "new" })]]);
      const inputs: PhraseBankAttemptInput[] = [
        { phraseBankEntryId: "pbentry_1", phraseId: "phr_1", sequenceNumber: 1, verdict: "Ok", score: 9 },
        { phraseBankEntryId: "pbentry_1", phraseId: "phr_2", sequenceNumber: 5, verdict: "Ok", score: 9 },
      ];

      const outcomes = applyPhraseBankAttempts(inputs, entries);

      expect(outcomes[0]!.nextEntry.masteryStage).toBe(1);
      expect(outcomes[1]!.nextEntry.masteryStage).toBe(2);
    });
  });

  describe("marking a transition to mastered", () => {
    it("flags justMastered only on the attempt that crosses the threshold", () => {
      const entries = new Map([["pbentry_1", baseEntry({ masteryStage: 2, lastCorrectAtSentenceCount: 5 })]]);
      const inputs: PhraseBankAttemptInput[] = [
        { phraseBankEntryId: "pbentry_1", phraseId: "phr_1", sequenceNumber: 9, verdict: "Ok", score: 10 },
      ];

      const [outcome] = applyPhraseBankAttempts(inputs, entries);

      expect(outcome!.justMastered).toBe(true);
      expect(outcome!.nextEntry.status).toBe("mastered");
    });
  });
});

describe("gradeAttempts", () => {
  describe("an untagged sentence with no notable target phrase", () => {
    it("performs no phrase-bank writes at all", async () => {
      practiceRepoState.phrases.set("phr_1", {
        id: "phr_1",
        russian: "Как дела?",
        referenceEnglish: "How's it going?",
        targetPhraseBankEntryId: null,
        sequenceNumber: 1,
      });

      mockAgentGenerate.mockResolvedValue({
        object: { gradedAnswers: [{ score: 8, verdict: "Ok", feedback: "Good.", nativeAlternatives: [] }] },
      });

      const result = await gradeAttempts("sub_1", "B1_B2", [{ phraseId: "phr_1", userAnswer: "How's it going" }]);

      expect(result.phraseBankUpdates).toEqual([]);
      expect(phraseBankRepoState.appearanceCalls).toEqual([]);
      expect(phraseBankRepoState.updateCalls).toEqual([]);
    });
  });

  describe("a graded attempt for a tracked phrase", () => {
    it("writes an appearance row and updates the entry on grading", async () => {
      practiceRepoState.phrases.set("phr_1", {
        id: "phr_1",
        russian: "Разберись с этим",
        referenceEnglish: "Get to the bottom of it",
        targetPhraseBankEntryId: "pbentry_1",
        sequenceNumber: 1,
      });
      phraseBankRepoState.entries.set("pbentry_1", baseEntry({ status: "new" }));

      mockAgentGenerate.mockResolvedValue({
        object: { gradedAnswers: [{ score: 9, verdict: "Ok", feedback: "Nice.", nativeAlternatives: [] }] },
      });

      const result = await gradeAttempts("sub_1", "B1_B2", [
        { phraseId: "phr_1", userAnswer: "Get to the bottom of it" },
      ]);

      expect(phraseBankRepoState.appearanceCalls).toHaveLength(1);
      expect(phraseBankRepoState.appearanceCalls[0]).toMatchObject({
        phraseBankEntryId: "pbentry_1",
        phraseId: "phr_1",
        sentenceCount: 1,
        result: "correct",
      });
      expect(phraseBankRepoState.updateCalls).toHaveLength(1);
      expect(result.phraseBankUpdates).toHaveLength(1);
      expect(result.phraseBankUpdates[0]).toMatchObject({ status: "practicing", masteryStage: 1 });
    });
  });

  describe("three sequential mocked generate+grade cycles for the same tracked phrase", () => {
    it("reaches status mastered after the third non-adjacent correct grading", async () => {
      phraseBankRepoState.entries.set("pbentry_1", baseEntry({ status: "new" }));

      const cycles = [
        { phraseId: "phr_1", sequenceNumber: 1 },
        { phraseId: "phr_2", sequenceNumber: 5 },
        { phraseId: "phr_3", sequenceNumber: 9 },
      ];

      for (const cycle of cycles) {
        practiceRepoState.phrases.set(cycle.phraseId, {
          id: cycle.phraseId,
          russian: "Разберись с этим",
          referenceEnglish: "Get to the bottom of it",
          targetPhraseBankEntryId: "pbentry_1",
          sequenceNumber: cycle.sequenceNumber,
        });

        mockAgentGenerate.mockResolvedValue({
          object: { gradedAnswers: [{ score: 9, verdict: "Ok", feedback: "Nice.", nativeAlternatives: [] }] },
        });

        await gradeAttempts("sub_1", "B1_B2", [{ phraseId: cycle.phraseId, userAnswer: "Get to the bottom of it" }]);
      }

      expect(phraseBankRepoState.entries.get("pbentry_1")).toMatchObject({
        status: "mastered",
        masteryStage: 3,
      });
    });
  });
});
