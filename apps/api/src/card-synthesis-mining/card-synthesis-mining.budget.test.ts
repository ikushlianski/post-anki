import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LlmCallOutcome } from "../llm-call-events/llm-call-events.repo.js";

interface Row {
  op: string;
  outcome: LlmCallOutcome;
  createdAt: Date;
}

const rows: Row[] = [];
const usage = { dayCostUsd: 0, dayTokens: 0, monthCostUsd: 0, monthTokens: 0, dayUnmeteredFailures: 0, monthUnmeteredFailures: 0 };

vi.mock("../shared/log.js", () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("../shared/env.js", () => ({
  loadEnv: () => ({
    CARD_SYNTHESIS_MINING_ENABLED: process.env.CARD_SYNTHESIS_MINING_ENABLED,
    CARD_SYNTHESIS_MINING_SUBJECT_IDS: process.env.CARD_SYNTHESIS_MINING_SUBJECT_IDS,
  }),
}));
vi.mock("../db/client.js", () => ({ getDb: vi.fn() }));
vi.mock("../llm-call-events/llm-call-events.repo.js", () => ({
  recordLlmCallEvent: vi.fn(async (input: { op: string; outcome: LlmCallOutcome }) => {
    rows.unshift({ op: input.op, outcome: input.outcome, createdAt: new Date() });
  }),
}));
vi.mock("./card-synthesis-mining-ledger.repo.js", async () => {
  const actual = await vi.importActual<typeof import("./card-synthesis-mining-ledger.repo.js")>(
    "./card-synthesis-mining-ledger.repo.js",
  );

  return {
    ...actual,
    miningLedger: {
      sumUsage: async () => ({ ...usage }),
      listRecentSteps: async (op: string, limit: number) =>
        rows.filter((row) => row.op === op && (row.outcome === "ok" || row.outcome === "failed")).slice(0, limit),
    },
  };
});

const { checkMiningGate, recordMiningClusterStep } = await import("./card-synthesis-mining.budget.js");
import { recordLlmCallEvent } from "../llm-call-events/llm-call-events.repo.js";

function switchOn(): void {
  vi.stubEnv("CARD_SYNTHESIS_MINING_ENABLED", "true");
  vi.stubEnv("CARD_SYNTHESIS_MINING_SUBJECT_IDS", "subj1");
}

beforeEach(() => {
  rows.length = 0;
  Object.assign(usage, { dayCostUsd: 0, dayTokens: 0, monthCostUsd: 0, monthTokens: 0 });
  vi.unstubAllEnvs();
  vi.mocked(recordLlmCallEvent).mockClear();
});

describe("checkMiningGate", () => {
  it("should refuse and write nothing when the kill switch is off", async () => {
    vi.stubEnv("CARD_SYNTHESIS_MINING_SUBJECT_IDS", "subj1");

    const gate = await checkMiningGate("run1", "c1");

    expect(gate).toEqual({ allowed: false, reason: "disabled" });
    expect(recordLlmCallEvent).not.toHaveBeenCalled();
  });

  it("should refuse when switched on but no subject is allowed", async () => {
    vi.stubEnv("CARD_SYNTHESIS_MINING_ENABLED", "true");

    expect(await checkMiningGate("run1", "c1")).toEqual({ allowed: false, reason: "disabled" });
  });

  it("should allow a cluster while spend is under the caps", async () => {
    switchOn();

    expect(await checkMiningGate("run1", "c1")).toEqual({ allowed: true, probe: false });
  });

  it("should stop and record a skipped_cap row for the cluster when today's spend reaches the daily cap", async () => {
    switchOn();
    usage.dayCostUsd = 0.049;

    const gate = await checkMiningGate("run1", "c1");

    expect(gate).toEqual({ allowed: false, reason: "cap_daily" });
    expect(rows[0]).toMatchObject({ op: "card_synthesis_mining_step", outcome: "skipped_cap" });
  });

  it("should stop on the monthly dollar cap even when the day is fine", async () => {
    switchOn();
    usage.monthCostUsd = 0.999;

    expect(await checkMiningGate("run1", "c1")).toEqual({ allowed: false, reason: "cap_monthly" });
  });

  it("should stop on the daily token cap", async () => {
    switchOn();
    usage.dayTokens = 145_000;

    expect(await checkMiningGate("run1", "c1")).toEqual({ allowed: false, reason: "cap_daily" });
  });

  it("should open the breaker after three failed clusters in a row, one step row per cluster", async () => {
    switchOn();

    for (const id of ["c1", "c2"]) {
      await recordMiningClusterStep("failed", "run1", id, 5, new Error("boom"));
    }

    expect(await checkMiningGate("run1", "c3")).toEqual({ allowed: true, probe: false });

    await recordMiningClusterStep("failed", "run1", "c3", 5, new Error("boom"));

    expect(await checkMiningGate("run1", "c4")).toEqual({ allowed: false, reason: "breaker_open" });
    expect(rows[0]).toMatchObject({ outcome: "skipped_breaker" });
  });

  it("should not trip the breaker when a successful cluster sits between failures", async () => {
    switchOn();
    await recordMiningClusterStep("failed", "run1", "c1", 5, new Error("x"));
    await recordMiningClusterStep("ok", "run1", "c2", 5);
    await recordMiningClusterStep("failed", "run1", "c3", 5, new Error("x"));

    expect(await checkMiningGate("run1", "c4")).toEqual({ allowed: true, probe: false });
  });

  it("should tag step rows with the run and cluster ids", async () => {
    await recordMiningClusterStep("ok", "run9", "c9", 7);

    expect(recordLlmCallEvent).toHaveBeenCalledWith(
      expect.objectContaining({ runId: "run9", clusterId: "c9", outcome: "ok", costUsd: 0 }),
    );
  });
});
