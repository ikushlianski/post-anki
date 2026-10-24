import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./curriculum-parse.orchestrator.js", () => ({ parseCurriculumOrThrow: vi.fn() }));
vi.mock("./curriculum-merge.orchestrator.js", () => ({ mergeSynthesizeOrThrow: vi.fn() }));
vi.mock("./curriculum.repo.js", () => ({ clearCurriculumStructure: vi.fn() }));
vi.mock("./curriculum-research-jobs.repo.js", () => ({
  touchResearchJob: vi.fn(),
  clearResearchJobTouch: vi.fn(),
}));

const { parseCurriculumOrThrow } = await import("./curriculum-parse.orchestrator.js");
const { mergeSynthesizeOrThrow } = await import("./curriculum-merge.orchestrator.js");
const { clearCurriculumStructure } = await import("./curriculum.repo.js");
const { touchResearchJob, clearResearchJobTouch } = await import("./curriculum-research-jobs.repo.js");
const { prepareParseStep, synthesizeParseStep } = await import("./curriculum-parse.steps.js");

describe("curriculum parse steps", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(touchResearchJob).mockResolvedValue(true);
  });

  it("should clear the structure only when reparsing", async () => {
    await prepareParseStep("c1", "parse");
    expect(clearCurriculumStructure).not.toHaveBeenCalled();

    await prepareParseStep("c1", "reparse");
    expect(clearCurriculumStructure).toHaveBeenCalledWith("c1");
  });

  it("should stop without retrying when the course no longer exists", async () => {
    vi.mocked(touchResearchJob).mockResolvedValue(false);

    await expect(prepareParseStep("c1", "merge")).rejects.toThrow("curriculum not found");
  });

  it("should use the merge path for merge and the parse path otherwise, clearing the touch both times", async () => {
    vi.mocked(mergeSynthesizeOrThrow).mockResolvedValue(2);
    vi.mocked(parseCurriculumOrThrow).mockResolvedValue(5);

    expect(await synthesizeParseStep("c1", "merge")).toEqual({ modules: 2 });
    expect(await synthesizeParseStep("c1", "reparse")).toEqual({ modules: 5 });
    expect(clearResearchJobTouch).toHaveBeenCalledTimes(2);
  });

  it("should keep the touch when the model call fails so the course can still be marked failed", async () => {
    vi.mocked(parseCurriculumOrThrow).mockRejectedValue(new Error("boom"));

    await expect(synthesizeParseStep("c1", "parse")).rejects.toThrow("boom");
    expect(clearResearchJobTouch).not.toHaveBeenCalled();
  });
});
