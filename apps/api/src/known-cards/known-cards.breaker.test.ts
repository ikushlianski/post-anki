import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LlmCallOutcome } from "../llm-call-events/llm-call-events.repo.js";

interface Row {
  op: string;
  outcome: LlmCallOutcome;
  createdAt: Date;
}

const rows: Row[] = [];

vi.mock("../shared/log.js", () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("../shared/env.js", () => ({ loadEnv: () => ({}) }));
vi.mock("../db/client.js", () => ({ getDb: vi.fn() }));
vi.mock("../llm-call-events/llm-call-events.repo.js", () => ({
  recordLlmCallEvent: vi.fn(async (input: { op: string; outcome: LlmCallOutcome }) => {
    rows.unshift({ op: input.op, outcome: input.outcome, createdAt: new Date() });
  }),
}));
vi.mock("./known-cards-ledger.repo.js", () => ({
  knownCardsLedger: {
    sumUsage: async () => ({
      dayCostUsd: 0,
      dayTokens: 0,
      monthCostUsd: 0,
      monthTokens: 0,
      dayUnmeteredFailures: 0,
      monthUnmeteredFailures: 0,
    }),
    listRecentSteps: async (op: string, limit: number) =>
      rows.filter((row) => row.op === op && (row.outcome === "ok" || row.outcome === "failed")).slice(0, limit),
  },
  recordKnownCardsSkip: vi.fn(async (outcome: LlmCallOutcome) => {
    rows.unshift({ op: "known_cards_step", outcome, createdAt: new Date() });
  }),
}));
vi.mock("./known-cards.retrieval.js", () => ({ retrieveKnownCardCandidates: vi.fn() }));
vi.mock("./known-cards.judge.js", () => ({ judgeKnownCards: vi.fn() }));

import { recordLlmCallEvent } from "../llm-call-events/llm-call-events.repo.js";
import { judgeKnownCards } from "./known-cards.judge.js";
import { resolveKnownCardsBlock } from "./known-cards.orchestrator.js";
import { retrieveKnownCardCandidates } from "./known-cards.retrieval.js";
import { KnownCardsLedgeredError } from "./known-cards.types.js";

const candidate = { id: "a", body: "b", question: "q", answer: "a", similarity: 0.7 };

async function chunk(index: number): Promise<string> {
  return resolveKnownCardsBlock("note", { knowledgeSourceId: "src", chunkIndex: index });
}

beforeEach(() => {
  rows.length = 0;
  vi.mocked(recordLlmCallEvent).mockClear();
  vi.mocked(retrieveKnownCardCandidates).mockImplementation(async () => {
    rows.unshift({ op: "known_cards_embed", outcome: "ok", createdAt: new Date() });

    return [candidate];
  });
});

describe("known cards breaker with mixed embed and judge rows", () => {
  it("should open after five chunks whose judge failed even though every embed call succeeded", async () => {
    vi.mocked(judgeKnownCards).mockImplementation(async () => {
      rows.unshift({ op: "known_cards_judge", outcome: "failed", createdAt: new Date() });

      throw new KnownCardsLedgeredError("judge", new Error("provider down"));
    });

    for (let i = 0; i < 5; i += 1) {
      await chunk(i);
    }

    vi.mocked(retrieveKnownCardCandidates).mockClear();

    await expect(chunk(5)).resolves.toBe("");
    expect(retrieveKnownCardCandidates).not.toHaveBeenCalled();
    expect(rows[0]).toMatchObject({ op: "known_cards_step", outcome: "skipped_breaker" });
  });

  it("should open when the judge keeps returning output that fails validation", async () => {
    vi.mocked(judgeKnownCards).mockRejectedValue(new KnownCardsLedgeredError("judge", new Error("known_cards_invalid_output")));

    for (let i = 0; i < 5; i += 1) {
      await chunk(i);
    }

    expect(rows.filter((row) => row.op === "known_cards_step" && row.outcome === "failed")).toHaveLength(5);

    vi.mocked(retrieveKnownCardCandidates).mockClear();
    await chunk(5);

    expect(retrieveKnownCardCandidates).not.toHaveBeenCalled();
  });

  it("should stay closed when failures are interleaved with successful chunks", async () => {
    vi.mocked(judgeKnownCards)
      .mockRejectedValueOnce(new Error("x"))
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error("x"))
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error("x"))
      .mockResolvedValue([]);

    for (let i = 0; i < 6; i += 1) {
      await chunk(i);
    }

    expect(rows.some((row) => row.outcome === "skipped_breaker")).toBe(false);
  });
});
