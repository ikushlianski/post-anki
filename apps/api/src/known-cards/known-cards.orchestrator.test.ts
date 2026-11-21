import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../shared/log.js", () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("../llm-call-events/llm-call-events.repo.js", () => ({ recordLlmCallEvent: vi.fn() }));
vi.mock("./known-cards-ledger.repo.js", () => ({ recordKnownCardsSkip: vi.fn().mockResolvedValue(undefined) }));
vi.mock("./known-cards.budget.js", () => ({ checkKnownCardsGate: vi.fn() }));
vi.mock("./known-cards.retrieval.js", () => ({ retrieveKnownCardCandidates: vi.fn() }));
vi.mock("./known-cards.judge.js", () => ({ judgeKnownCards: vi.fn() }));

import { recordLlmCallEvent } from "../llm-call-events/llm-call-events.repo.js";
import { recordKnownCardsSkip } from "./known-cards-ledger.repo.js";
import { checkKnownCardsGate } from "./known-cards.budget.js";
import { judgeKnownCards } from "./known-cards.judge.js";
import { resolveKnownCardsBlock } from "./known-cards.orchestrator.js";
import { retrieveKnownCardCandidates } from "./known-cards.retrieval.js";
import { KnownCardsLedgeredError, type JudgedKnownCard, type KnownCardCandidate } from "./known-cards.types.js";

const ctx = { knowledgeSourceId: "src_1", chunkIndex: 0 };
const candidate: KnownCardCandidate = { id: "a", body: "b", question: "q", answer: "a", similarity: 0.7 };
const judged: JudgedKnownCard = {
  id: "a",
  verdict: "near",
  overlap: "same idea",
  reason: "LEAKY-REASON",
  question: "What is X?",
  answer: "Y",
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(checkKnownCardsGate).mockResolvedValue({ allowed: true } as never);
  vi.mocked(retrieveKnownCardCandidates).mockResolvedValue([candidate]);
  vi.mocked(judgeKnownCards).mockResolvedValue([judged]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("resolveKnownCardsBlock", () => {
  it("should return a block with the similar card and without the judge's reason", async () => {
    const block = await resolveKnownCardsBlock("note", ctx);

    expect(block).toContain("[near] Q: What is X?");
    expect(block).not.toContain("LEAKY-REASON");
  });

  it("should record one ok step row for every resolver run so the breaker sees one outcome per chunk", async () => {
    await resolveKnownCardsBlock("note", ctx);

    expect(recordLlmCallEvent).toHaveBeenCalledTimes(1);
    expect(recordLlmCallEvent).toHaveBeenCalledWith(
      expect.objectContaining({ op: "known_cards_step", outcome: "ok", success: true }),
    );
  });

  it("should let only one chunk probe at a time while the breaker is half open", async () => {
    vi.mocked(checkKnownCardsGate).mockResolvedValue({ allowed: true, probe: true });

    let release: (cards: JudgedKnownCard[]) => void = () => undefined;

    vi.mocked(judgeKnownCards).mockReturnValue(new Promise((resolve) => { release = resolve; }));

    const first = resolveKnownCardsBlock("note", ctx);
    await vi.waitFor(() => expect(judgeKnownCards).toHaveBeenCalledTimes(1));

    await expect(resolveKnownCardsBlock("note", { ...ctx, chunkIndex: 1 })).resolves.toBe("");
    expect(recordKnownCardsSkip).toHaveBeenCalledWith("skipped_breaker", "src_1");
    expect(judgeKnownCards).toHaveBeenCalledTimes(1);

    release([judged]);
    await first;

    await resolveKnownCardsBlock("note", { ...ctx, chunkIndex: 2 });
    expect(judgeKnownCards).toHaveBeenCalledTimes(2);
  });

  it("should skip the judge and return empty when nothing similar exists", async () => {
    vi.mocked(retrieveKnownCardCandidates).mockResolvedValue([]);

    await expect(resolveKnownCardsBlock("note", ctx)).resolves.toBe("");
    expect(judgeKnownCards).not.toHaveBeenCalled();
  });

  it("should return empty without retrieving when the gate denies the step", async () => {
    vi.mocked(checkKnownCardsGate).mockResolvedValue({ allowed: false, reason: "cap_daily" } as never);

    await expect(resolveKnownCardsBlock("note", ctx)).resolves.toBe("");
    expect(retrieveKnownCardCandidates).not.toHaveBeenCalled();
    expect(recordLlmCallEvent).not.toHaveBeenCalled();
  });

  it("should return empty and not throw when the gate itself throws", async () => {
    vi.mocked(checkKnownCardsGate).mockRejectedValue(new Error("db down"));

    await expect(resolveKnownCardsBlock("note", ctx)).resolves.toBe("");
  });

  it("should return empty and record a failed step when the vector search fails", async () => {
    vi.mocked(retrieveKnownCardCandidates).mockRejectedValue(new Error("search down"));

    await expect(resolveKnownCardsBlock("note", ctx)).resolves.toBe("");
    expect(recordLlmCallEvent).toHaveBeenCalledWith(
      expect.objectContaining({ op: "known_cards_step", outcome: "failed", success: false }),
    );
  });

  it("should return empty and record a failed step when the judge output is unusable", async () => {
    vi.mocked(judgeKnownCards).mockRejectedValue(new Error("known_cards_invalid_output"));

    await expect(resolveKnownCardsBlock("note", ctx)).resolves.toBe("");
    expect(recordLlmCallEvent).toHaveBeenCalledTimes(1);
  });

  it("should still record a failed step when the judge call itself failed, so the breaker can count it", async () => {
    vi.mocked(judgeKnownCards).mockRejectedValue(new KnownCardsLedgeredError("judge", new Error("x")));

    await expect(resolveKnownCardsBlock("note", ctx)).resolves.toBe("");
    expect(recordLlmCallEvent).toHaveBeenCalledWith(
      expect.objectContaining({ op: "known_cards_step", outcome: "failed", success: false }),
    );
  });

  it("should give up after 20 seconds and return empty", async () => {
    vi.useFakeTimers();
    vi.mocked(judgeKnownCards).mockReturnValue(new Promise(() => undefined));

    const pending = resolveKnownCardsBlock("note", ctx);

    await vi.advanceTimersByTimeAsync(20_001);

    await expect(pending).resolves.toBe("");
    expect(recordLlmCallEvent).toHaveBeenCalledWith(
      expect.objectContaining({ errorMessage: "known_cards_deadline", outcome: "failed" }),
    );
  });

  it("should return empty when only unrelated cards come back", async () => {
    vi.mocked(judgeKnownCards).mockResolvedValue([]);

    await expect(resolveKnownCardsBlock("note", ctx)).resolves.toBe("");
  });

  it("should still return empty when recording the failure row itself fails", async () => {
    vi.mocked(retrieveKnownCardCandidates).mockRejectedValue(new Error("x"));
    vi.mocked(recordLlmCallEvent).mockRejectedValue(new Error("db"));

    await expect(resolveKnownCardsBlock("note", ctx)).resolves.toBe("");
  });
});
