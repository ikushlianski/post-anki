import { beforeEach, describe, expect, it, vi } from "vitest";
import { LlmBudgetExceededError } from "../shared/spend-guard.js";

vi.mock("../shared/log.js", () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("../mastra/card-synthesis-writer.agent.js", () => ({ runCardSynthesisWriter: vi.fn() }));
vi.mock("../mastra/card-synthesis-classifier.agent.js", () => ({ runCardSynthesisClassifier: vi.fn() }));
vi.mock("./card-synthesis-mining.budget.js", () => ({ checkMiningGate: vi.fn(), recordMiningClusterStep: vi.fn() }));
vi.mock("./card-synthesis-mining-ledger.repo.js", () => ({ insertMiningCluster: vi.fn() }));
vi.mock("./card-synthesis-mining-marking.js", () => ({ markClusterExamined: vi.fn() }));
vi.mock("./card-synthesis-mining.duplicate-gate.js", () => ({ hasNearDuplicateOverview: vi.fn() }));
vi.mock("./card-synthesis-mining.submit.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./card-synthesis-mining.submit.js")>()),
  submitOverview: vi.fn(),
  synthesisSourceExists: vi.fn(),
}));
vi.mock("./card-synthesis-mining.cards.repo.js", () => ({ loadEvidenceCards: vi.fn() }));

import { runCardSynthesisClassifier } from "../mastra/card-synthesis-classifier.agent.js";
import { runCardSynthesisWriter } from "../mastra/card-synthesis-writer.agent.js";
import { checkMiningGate, recordMiningClusterStep } from "./card-synthesis-mining.budget.js";
import { loadEvidenceCards } from "./card-synthesis-mining.cards.repo.js";
import { hasNearDuplicateOverview } from "./card-synthesis-mining.duplicate-gate.js";
import { mineCluster } from "./card-synthesis-mining.orchestrator.js";
import { submitOverview, synthesisSourceExists } from "./card-synthesis-mining.submit.js";
import { insertMiningCluster } from "./card-synthesis-mining-ledger.repo.js";
import { markClusterExamined } from "./card-synthesis-mining-marking.js";

const cluster = { bitIds: ["kb_1", "kb_2", "kb_3"], overflowBitIds: ["kb_9"] };
const ctx = { runId: "run1", subjectId: "subj", clusterId: "c1" };
const writerOutput = {
  lead: "Lead.",
  steps: ["K1", "K2", "K3"].map((k) => ({ technique: `T${k}`, text: `text ${k}`, evidenceCardIds: [k] })),
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(checkMiningGate).mockResolvedValue({ allowed: true } as never);
  vi.mocked(loadEvidenceCards).mockResolvedValue(
    cluster.bitIds.map((id) => ({ id, question: `Q ${id}`, answer: `A ${id}` })),
  );
  vi.mocked(synthesisSourceExists).mockResolvedValue(false);
  vi.mocked(runCardSynthesisClassifier).mockResolvedValue({ isChain: true, title: "What is the sequence?", reason: "LEAKY-REASON" });
  vi.mocked(hasNearDuplicateOverview).mockResolvedValue(false);
  vi.mocked(runCardSynthesisWriter).mockResolvedValue(writerOutput);
  vi.mocked(submitOverview).mockResolvedValue({ status: "created", sourceId: "ks1", bitId: "kb_new" });
});

describe("mineCluster", () => {
  it("should synthesize a pending overview, store the cluster with evidence and mark the cards examined", async () => {
    const result = await mineCluster(cluster, ctx);

    expect(result).toEqual({ outcome: "synthesized", clusterId: "c1", sourceId: "ks1", bitId: "kb_new" });
    expect(insertMiningCluster).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "synthesized", sourceId: "ks1", evidenceBitIds: ["kb_1", "kb_2", "kb_3"] }),
    );
    expect(markClusterExamined).toHaveBeenCalledWith("run1", "c1", cluster, "synthesized");
    expect(recordMiningClusterStep).toHaveBeenCalledWith("ok", "run1", "c1", expect.any(Number));
  });

  it("should keep the classifier reason out of the writer prompt", async () => {
    await mineCluster(cluster, ctx);

    const [prompt] = vi.mocked(runCardSynthesisWriter).mock.calls[0] ?? [];

    expect(prompt).toContain("What is the sequence?");
    expect(prompt).not.toContain("LEAKY-REASON");
  });

  it("should stop without calling the writer when the cards are not a chain", async () => {
    vi.mocked(runCardSynthesisClassifier).mockResolvedValue({ isChain: false, title: "", reason: "no" });

    const result = await mineCluster(cluster, ctx);

    expect(result.outcome).toBe("not_chain");
    expect(runCardSynthesisWriter).not.toHaveBeenCalled();
    expect(submitOverview).not.toHaveBeenCalled();
  });

  it("should record a duplicate and skip the writer when a similar approved card exists", async () => {
    vi.mocked(hasNearDuplicateOverview).mockResolvedValue(true);

    const result = await mineCluster(cluster, ctx);

    expect(result.outcome).toBe("duplicate_existing");
    expect(runCardSynthesisWriter).not.toHaveBeenCalled();
    expect(markClusterExamined).toHaveBeenCalledWith("run1", "c1", cluster, "duplicate_existing");
  });

  it("should not spend any model call on a rerun whose keyed source already exists", async () => {
    vi.mocked(synthesisSourceExists).mockResolvedValue(true);

    const result = await mineCluster(cluster, ctx);

    expect(result.outcome).toBe("duplicate_existing");
    expect(runCardSynthesisClassifier).not.toHaveBeenCalled();
  });

  it("should reject an ungrounded draft without inserting anything", async () => {
    vi.mocked(runCardSynthesisWriter).mockResolvedValue({
      lead: "Lead.",
      steps: writerOutput.steps.map((s) => ({ ...s, evidenceCardIds: ["K99"] })),
    });

    const result = await mineCluster(cluster, ctx);

    expect(result.outcome).toBe("rejected_ungrounded");
    expect(submitOverview).not.toHaveBeenCalled();
  });

  it("should leave the cards unmarked and retryable when a model call fails on a provider error", async () => {
    vi.mocked(runCardSynthesisClassifier).mockRejectedValue(new Error("503 upstream timeout"));

    const result = await mineCluster(cluster, ctx);

    expect(result.outcome).toBe("failed_retryable");
    expect(recordMiningClusterStep).toHaveBeenCalledWith("failed", "run1", "c1", expect.any(Number), expect.any(Error));
    expect(insertMiningCluster).toHaveBeenCalledWith(expect.objectContaining({ outcome: "failed_retryable" }));
    expect(markClusterExamined).toHaveBeenCalledWith("run1", "c1", cluster, "failed_retryable");
  });

  it("should report a budget stop and keep the cards for a later day when the LLM budget is exceeded", async () => {
    vi.mocked(runCardSynthesisClassifier).mockRejectedValue(new LlmBudgetExceededError(5, 5));

    const result = await mineCluster(cluster, ctx);

    expect(result.outcome).toBe("failed_budget");
    expect(markClusterExamined).toHaveBeenCalledWith("run1", "c1", cluster, "failed_budget");
  });

  it("should finalize the cluster as failed when the model output is invalid", async () => {
    vi.mocked(runCardSynthesisClassifier).mockRejectedValue(new Error("card_synthesis_invalid_output: bad"));

    const result = await mineCluster(cluster, ctx);

    expect(result.outcome).toBe("failed");
    expect(markClusterExamined).toHaveBeenCalledWith("run1", "c1", cluster, "failed");
  });

  it("should still return the outcome when saving the cluster row fails", async () => {
    vi.mocked(insertMiningCluster).mockRejectedValue(new Error("db down"));

    await expect(mineCluster(cluster, ctx)).resolves.toMatchObject({ outcome: "synthesized" });
  });

  it("should skip with no model call and no marking when the budget gate denies", async () => {
    vi.mocked(checkMiningGate).mockResolvedValue({ allowed: false, reason: "cap_daily" });

    const result = await mineCluster(cluster, ctx);

    expect(result.outcome).toBe("skipped_cap");
    expect(runCardSynthesisClassifier).not.toHaveBeenCalled();
    expect(markClusterExamined).not.toHaveBeenCalled();
  });

  it("should return a failed outcome when even the gate check throws", async () => {
    vi.mocked(checkMiningGate).mockRejectedValue(new Error("x"));

    await expect(mineCluster(cluster, ctx)).resolves.toMatchObject({ outcome: "failed_retryable" });
  });
});
