import { beforeEach, describe, expect, it, vi } from "vitest";

const compileLecture = vi.hoisted(() => vi.fn());
const generateStudyMaterial = vi.hoisted(() => vi.fn());
const generateKnowledgeBitVariants = vi.hoisted(() => vi.fn());
const getKnowledgeSourceRawText = vi.hoisted(() => vi.fn());
const runArticleSummary = vi.hoisted(() => vi.fn());
const updateKnowledgeSourceSummary = vi.hoisted(() => vi.fn());
const mergeSourcesIntoCurriculum = vi.hoisted(() => vi.fn());
const getSessionRow = vi.hoisted(() => vi.fn());
const maybeReplenish = vi.hoisted(() => vi.fn());

vi.mock("../lecture/lecture.orchestrator.js", () => ({ compileLecture }));
vi.mock("../study-material/study-material.orchestrator.js", () => ({ generateStudyMaterial }));
vi.mock("../knowledge-bit/knowledge-bit-generate-variants.orchestrator.js", () => ({ generateKnowledgeBitVariants }));
vi.mock("../knowledge-bit/knowledge-bit.repo.js", () => ({ getKnowledgeSourceRawText }));
vi.mock("../mastra/article-summary.agent.js", () => ({ runArticleSummary }));
vi.mock("../knowledge-source/knowledge-source.repo.js", () => ({ updateKnowledgeSourceSummary }));
vi.mock("../curriculum/curriculum-merge.orchestrator.js", () => ({ mergeSourcesIntoCurriculum }));
vi.mock("../probe-session/probe-session.repo.js", () => ({ getSessionRow }));
vi.mock("../probe-session/probe-session.service.js", () => ({ maybeReplenish }));

const { runBackgroundJob } = await import("./background-job.handlers.js");

describe("runBackgroundJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should compile the lecture for the topic named in the job", async () => {
    await runBackgroundJob({ kind: "lecture-compile", topicId: "t1" });

    expect(compileLecture).toHaveBeenCalledWith("t1");
  });

  it("should generate the requested kind of study material", async () => {
    await runBackgroundJob({ kind: "study-material", materialId: "m1", topicId: "t1", materialKind: "analogy" });

    expect(generateStudyMaterial).toHaveBeenCalledWith("m1", "t1", "analogy");
  });

  it("should generate card variants for one knowledge bit", async () => {
    await runBackgroundJob({ kind: "knowledge-bit-variants", bitId: "b1" });

    expect(generateKnowledgeBitVariants).toHaveBeenCalledWith("b1");
  });

  it("should summarize the stored source text and save the summary", async () => {
    getKnowledgeSourceRawText.mockResolvedValue("article body");
    runArticleSummary.mockResolvedValue("short summary");

    await runBackgroundJob({ kind: "article-summary", sourceId: "s1" });

    expect(runArticleSummary).toHaveBeenCalledWith("article body");
    expect(updateKnowledgeSourceSummary).toHaveBeenCalledWith("s1", "short summary");
  });

  it("should skip the summary and spend nothing when the source text is gone", async () => {
    getKnowledgeSourceRawText.mockResolvedValue(null);

    await runBackgroundJob({ kind: "article-summary", sourceId: "s1" });

    expect(runArticleSummary).not.toHaveBeenCalled();
  });

  it("should top up the stored session with the progress seen at answer time", async () => {
    const session = { id: "ps1" };
    const progress = { total: 5, answered: 4, correct: 2 };

    getSessionRow.mockResolvedValue(session);

    await runBackgroundJob({ kind: "probe-replenish", sessionId: "ps1", progress });

    expect(maybeReplenish).toHaveBeenCalledWith(session, progress);
  });

  it("should not top up a session that no longer exists", async () => {
    getSessionRow.mockResolvedValue(null);

    await runBackgroundJob({
      kind: "probe-replenish",
      sessionId: "gone",
      progress: { total: 1, answered: 1, correct: 1 },
    });

    expect(maybeReplenish).not.toHaveBeenCalled();
  });

  it("should merge the extension sources into the existing curriculum", async () => {
    await runBackgroundJob({ kind: "learning-list-merge", itemId: "i1", curriculumId: "c1", drafts: [] });

    expect(mergeSourcesIntoCurriculum).toHaveBeenCalledWith("c1", []);
  });
});
