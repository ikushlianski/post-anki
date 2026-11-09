import { describe, expect, it } from "vitest";

import { isDurableExtractionEnabled } from "./durable-extraction.flag.js";
import { isDurableBackgroundJobsEnabled } from "../shared/durable-flags.js";

describe("durable ingestion flags", () => {
  it("should treat ingestion as durable in production even when the flag is unset", () => {
    expect(isDurableExtractionEnabled(undefined, "production")).toBe(true);
    expect(isDurableBackgroundJobsEnabled(undefined, "production")).toBe(true);
  });

  it("should keep the flag opt-in outside production", () => {
    expect(isDurableExtractionEnabled(undefined, "development")).toBe(false);
    expect(isDurableExtractionEnabled("1", "development")).toBe(true);
    expect(isDurableBackgroundJobsEnabled(undefined, "test")).toBe(false);
    expect(isDurableBackgroundJobsEnabled("true", "test")).toBe(true);
  });
});
