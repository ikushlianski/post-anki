import { describe, expect, it } from "vitest";
import { summarizeLlmError } from "./llm-error-summary.js";

describe("summarizeLlmError", () => {
  it("should name only the error class and HTTP status so a provider body echoing the prompt is never stored", () => {
    const err = Object.assign(new Error("400 {\"echo\":\"secret prompt text\"}"), {
      name: "APICallError",
      statusCode: 400,
    });

    expect(summarizeLlmError(err)).toBe("APICallError (400)");
  });

  it("should find the status on a wrapped cause", () => {
    const err = new Error("wrapped", { cause: { status: 429 } });

    expect(summarizeLlmError(err)).toBe("Error (429)");
  });

  it("should use a short string code when there is no status", () => {
    const err = Object.assign(new Error("boom"), { code: "ECONNRESET" });

    expect(summarizeLlmError(err)).toBe("Error (ECONNRESET)");
  });

  it("should ignore a code that looks like free text", () => {
    const err = Object.assign(new Error("boom"), { code: "my prompt was this" });

    expect(summarizeLlmError(err)).toBe("Error");
  });

  it("should label a thrown non-error value without printing it", () => {
    expect(summarizeLlmError("sk-secret-value")).toBe("NonError");
  });
});
