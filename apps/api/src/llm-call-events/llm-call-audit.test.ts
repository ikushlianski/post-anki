import { describe, expect, it } from "vitest";
import { auditFieldsFor } from "./llm-call-audit.js";

const FLASH = "openrouter/deepseek/deepseek-v4-flash";

describe("auditFieldsFor", () => {
  it("should add nothing for a caller that did not ask for auditing so other call sites stay unchanged", () => {
    expect(auditFieldsFor(undefined, FLASH, { promptTokens: 10, completionTokens: 5 }, true)).toEqual({});
  });

  it("should price a successful call from the price list and tag it with its source", () => {
    const fields = auditFieldsFor(
      { knowledgeSourceId: "src1", runId: "run1", clusterId: "c1" },
      FLASH,
      { promptTokens: 1_000_000, completionTokens: 1_000_000 },
      true,
    );

    expect(fields).toEqual({
      knowledgeSourceId: "src1",
      runId: "run1",
      clusterId: "c1",
      outcome: "ok",
      costUsd: 0.6,
    });
  });

  it("should mark a failed call with no tokens as failed and leave the cost unknown", () => {
    const fields = auditFieldsFor({ knowledgeSourceId: "src1" }, FLASH, { promptTokens: null, completionTokens: null }, false);

    expect(fields).toMatchObject({ outcome: "failed", costUsd: null, runId: null, clusterId: null });
  });

  it("should leave the cost unknown for a model without a price", () => {
    const fields = auditFieldsFor({}, "unknown/model", { promptTokens: 5, completionTokens: 5 }, true);

    expect(fields.costUsd).toBeNull();
  });
});
