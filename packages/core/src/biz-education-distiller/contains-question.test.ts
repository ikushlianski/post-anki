import { describe, expect, it } from "vitest";
import { containsQuestion } from "./contains-question.js";

describe("containsQuestion", () => {
  it("flags a row whose text asks something", () => {
    expect(containsQuestion("What is the fanout method?")).toBe(true);
  });

  it("leaves a plain statement alone", () => {
    expect(containsQuestion("The fanout method scales outreach without hiring.")).toBe(false);
  });

  it("flags a question mark buried mid-sentence", () => {
    expect(containsQuestion("Not sure? Revisit after Q3.")).toBe(true);
  });

  it("treats an empty string as no question", () => {
    expect(containsQuestion("")).toBe(false);
  });
});
