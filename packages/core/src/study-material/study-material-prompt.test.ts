import { describe, expect, it } from "vitest";
import { buildStudyMaterialPrompt } from "./study-material-prompt.js";

describe("buildStudyMaterialPrompt", () => {
  it("includes the topic title and grounding text for a worked example", () => {
    const prompt = buildStudyMaterialPrompt(
      "worked_example",
      "TCP handshake",
      "Grounding notes about TCP.",
      [],
    );

    expect(prompt).toContain("Topic: TCP handshake");
    expect(prompt).toContain("Grounding notes about TCP.");
    expect(prompt).toContain("worked example");
  });

  it("includes the topic title and grounding text for an analogy", () => {
    const prompt = buildStudyMaterialPrompt(
      "analogy",
      "TCP handshake",
      "Grounding notes about TCP.",
      [],
    );

    expect(prompt).toContain("Topic: TCP handshake");
    expect(prompt).toContain("analogy");
  });

  it("branches the instruction by kind", () => {
    const workedExample = buildStudyMaterialPrompt("worked_example", "T", "G", []);
    const analogy = buildStudyMaterialPrompt("analogy", "T", "G", []);

    expect(workedExample).not.toEqual(analogy);
  });

  it("lists available citation urls when present", () => {
    const prompt = buildStudyMaterialPrompt("analogy", "T", "G", ["https://example.com/a"]);

    expect(prompt).toContain("https://example.com/a");
  });

  it("states none are available when there are no citations", () => {
    const prompt = buildStudyMaterialPrompt("analogy", "T", "G", []);

    expect(prompt).toContain("(none)");
  });
});
