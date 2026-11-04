import { describe, expect, it } from "vitest";
import { NonRetriableError } from "inngest";
import { GENERIC_FAILURE_REASON, safeFailureReason } from "./durable-extraction.config.js";
import { toChunkError } from "./extraction-inngest.errors.js";

function budgetError(): Error {
  return Object.assign(new Error("LLM daily budget reached: spent about $1.0000 of $1"), {
    code: "LLM_BUDGET_EXCEEDED",
  });
}

describe("safeFailureReason", () => {
  it("should name the daily AI limit when the budget stopped the call", () => {
    expect(safeFailureReason(budgetError())).toBe("llm_budget_paused");
  });

  it("should still name the daily AI limit when the budget error is wrapped", () => {
    expect(safeFailureReason(new Error("wrapped", { cause: budgetError() }))).toBe("llm_budget_paused");
  });

  it("should keep other known codes and hide free-text provider errors", () => {
    expect(safeFailureReason(new Error("source_empty"))).toBe("source_empty");
    expect(safeFailureReason(new Error("socket hang up for note text"))).toBe(GENERIC_FAILURE_REASON);
  });
});

describe("toChunkError for a budget stop", () => {
  it("should not be retried by the engine and should carry the budget reason", () => {
    const err = toChunkError(budgetError());

    expect(err).toBeInstanceOf(NonRetriableError);
    expect(err.message).toBe("llm_budget_paused");
  });
});
