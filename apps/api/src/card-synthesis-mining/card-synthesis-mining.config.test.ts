import { describe, expect, it } from "vitest";
import {
  isMiningActive,
  isMiningEnabled,
  miningBudgetSpec,
  miningCaps,
  miningRunLimits,
  miningSubjectIds,
} from "./card-synthesis-mining.config.js";

describe("isMiningEnabled", () => {
  it("should stay off when nothing is configured so the job costs nothing", () => {
    expect(isMiningEnabled({})).toBe(false);
  });

  it.each(["true", "1", "on", "yes", " ON "])("should turn on for %s", (value) => {
    expect(isMiningEnabled({ CARD_SYNTHESIS_MINING_ENABLED: value })).toBe(true);
  });

  it.each(["false", "0", "off", "maybe", ""])("should stay off for %s", (value) => {
    expect(isMiningEnabled({ CARD_SYNTHESIS_MINING_ENABLED: value })).toBe(false);
  });
});

describe("miningSubjectIds", () => {
  it("should be empty by default", () => {
    expect(miningSubjectIds({})).toEqual([]);
  });

  it("should trim, drop blanks and duplicates", () => {
    expect(miningSubjectIds({ CARD_SYNTHESIS_MINING_SUBJECT_IDS: " a, b,,a , " })).toEqual(["a", "b"]);
  });
});

describe("isMiningActive", () => {
  it("should do nothing when enabled but the allow-list is empty", () => {
    expect(isMiningActive({ CARD_SYNTHESIS_MINING_ENABLED: "true" })).toBe(false);
  });

  it("should do nothing when the allow-list is set but the switch is off", () => {
    expect(isMiningActive({ CARD_SYNTHESIS_MINING_SUBJECT_IDS: "a" })).toBe(false);
  });

  it("should run when switched on with at least one subject", () => {
    expect(isMiningActive({ CARD_SYNTHESIS_MINING_ENABLED: "1", CARD_SYNTHESIS_MINING_SUBJECT_IDS: "a" })).toBe(true);
  });
});

describe("miningCaps and limits", () => {
  it("should default to five cents and 150k tokens a day and one dollar a month", () => {
    expect(miningCaps({})).toMatchObject({ dailyUsd: 0.05, dailyTokens: 150_000, monthlyUsd: 1 });
  });

  it("should default to 60 cards examined and 3 new cards a day", () => {
    expect(miningRunLimits({})).toEqual({ maxBits: 60, maxNewCards: 3 });
  });

  it("should let the environment override caps and limits", () => {
    const env = {
      CARD_SYNTHESIS_MINING_DAILY_BUDGET_USD: 0.02,
      CARD_SYNTHESIS_MINING_MAX_NEW_CARDS_PER_DAY: 1,
    };

    expect(miningCaps(env).dailyUsd).toBe(0.02);
    expect(miningRunLimits(env).maxNewCards).toBe(1);
  });
});

describe("miningBudgetSpec", () => {
  it("should use the card_synthesis_mining feature key with a per-cluster step op", () => {
    const spec = miningBudgetSpec({});

    expect(spec.featureKey).toBe("card_synthesis_mining");
    expect(spec.stepOp.startsWith("card_synthesis_mining_")).toBe(true);
    expect(spec.breaker.failureThreshold).toBe(3);
  });
});
