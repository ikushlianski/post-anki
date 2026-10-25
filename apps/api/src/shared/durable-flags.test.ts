import { describe, expect, it } from "vitest";

import { listDisabledDurableFlags } from "./durable-flags.js";

describe("listDisabledDurableFlags", () => {
  it("should list all four flags when none is set", () => {
    expect(listDisabledDurableFlags({})).toEqual([
      "DURABLE_EXTRACTION",
      "DURABLE_CARDS",
      "DURABLE_COURSE_JOBS",
      "DURABLE_BACKGROUND_JOBS",
    ]);
  });

  it("should list nothing when every flag is 1 or true", () => {
    expect(
      listDisabledDurableFlags({
        DURABLE_EXTRACTION: "1",
        DURABLE_CARDS: "true",
        DURABLE_COURSE_JOBS: "1",
        DURABLE_BACKGROUND_JOBS: "true",
      }),
    ).toEqual([]);
  });

  it("should list only the flags that are off, in declaration order", () => {
    expect(
      listDisabledDurableFlags({
        DURABLE_EXTRACTION: "1",
        DURABLE_CARDS: "0",
        DURABLE_COURSE_JOBS: "1",
        DURABLE_BACKGROUND_JOBS: "",
      }),
    ).toEqual(["DURABLE_CARDS", "DURABLE_BACKGROUND_JOBS"]);
  });

  it.each(["yes", "TRUE", " 1", "false"])("should treat %j as off", (value) => {
    expect(listDisabledDurableFlags({ DURABLE_CARDS: value })).toContain("DURABLE_CARDS");
  });
});
