import { beforeEach, describe, expect, it, vi } from "vitest";

const generate = vi.fn();

vi.mock("../mastra/mastra.js", () => ({
  AGENT_KEYS: { studyMaterialWriter: "studyMaterialWriter" },
  getMastra: () => ({ getAgent: () => ({ generate }) }),
}));

const getTopicRow = vi.fn();

vi.mock("../topic/topic-progress.repo.js", () => ({
  getTopicRow: (id: string) => getTopicRow(id),
}));

const listGapsForTopic = vi.fn();

vi.mock("../gap/gap.repo.js", () => ({
  listGapsForTopic: (id: string) => listGapsForTopic(id),
}));

const getCurriculumContextForTopic = vi.fn();
const getCurriculumGroundingText = vi.fn();
const getCurriculumCitableUrls = vi.fn();

vi.mock("../curriculum/curriculum.repo.js", () => ({
  getCurriculumContextForTopic: (id: string) => getCurriculumContextForTopic(id),
  getCurriculumGroundingText: (id: string) => getCurriculumGroundingText(id),
  getCurriculumCitableUrls: (id: string) => getCurriculumCitableUrls(id),
}));

const webSearch = vi.fn();

vi.mock("../probe/probe-grounding.js", () => ({
  webSearch: (prompt: string, spanName: string, attrs: Record<string, unknown>) =>
    webSearch(prompt, spanName, attrs),
}));

const setStudyMaterialReady = vi.fn();
const setStudyMaterialFailed = vi.fn();

vi.mock("./study-material.repo.js", () => ({
  setStudyMaterialReady: (id: string, body: string, citations: unknown[]) =>
    setStudyMaterialReady(id, body, citations),
  setStudyMaterialFailed: (id: string, reason: string) => setStudyMaterialFailed(id, reason),
}));

vi.mock("../shared/log.js", () => ({
  log: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const { generateStudyMaterial } = await import("./study-material.orchestrator.js");

const TOPIC = { id: "t1", title: "TCP handshake", summary: null };
const CURRICULUM_CTX = { curriculumId: "c1", status: "confirmed", speed: "normal", hinting: false };
const MATERIAL_ID = "sm1";

describe("generateStudyMaterial", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTopicRow.mockResolvedValue(TOPIC);
    listGapsForTopic.mockResolvedValue([]);
    getCurriculumContextForTopic.mockResolvedValue(null);
    getCurriculumGroundingText.mockResolvedValue("");
    getCurriculumCitableUrls.mockResolvedValue([]);
    webSearch.mockResolvedValue({ ok: true, text: "", citations: [] });
  });

  it("generates a grounded worked example when curriculum sources are usable", async () => {
    getCurriculumContextForTopic.mockResolvedValue(CURRICULUM_CTX);
    getCurriculumGroundingText.mockResolvedValue("x".repeat(250));
    getCurriculumCitableUrls.mockResolvedValue(["https://example.com/src"]);
    generate.mockResolvedValue({
      object: {
        body: "A worked example body.",
        citations: [{ title: "Source", url: "https://example.com/src" }],
      },
    });

    await generateStudyMaterial(MATERIAL_ID, TOPIC.id, "worked_example");

    expect(webSearch).not.toHaveBeenCalled();
    expect(setStudyMaterialReady).toHaveBeenCalledWith(MATERIAL_ID, "A worked example body.", [
      { title: "Source", url: "https://example.com/src" },
    ]);
    expect(setStudyMaterialFailed).not.toHaveBeenCalled();
  });

  it("generates an analogy through the same mechanism, with a kind-branched prompt", async () => {
    getCurriculumContextForTopic.mockResolvedValue(CURRICULUM_CTX);
    getCurriculumGroundingText.mockResolvedValue("x".repeat(250));
    getCurriculumCitableUrls.mockResolvedValue([]);
    generate.mockResolvedValue({ object: { body: "An analogy body.", citations: [] } });

    await generateStudyMaterial(MATERIAL_ID, TOPIC.id, "analogy");

    const prompt = generate.mock.calls[0]?.[0] as string;

    expect(prompt).toContain("analogy");
    expect(setStudyMaterialReady).toHaveBeenCalledWith(MATERIAL_ID, "An analogy body.", []);
  });

  it("drops a citation the writer returns that was not actually surfaced by grounding", async () => {
    getCurriculumContextForTopic.mockResolvedValue(CURRICULUM_CTX);
    getCurriculumGroundingText.mockResolvedValue("x".repeat(250));
    getCurriculumCitableUrls.mockResolvedValue(["https://example.com/real"]);
    generate.mockResolvedValue({
      object: {
        body: "body",
        citations: [
          { title: "Real", url: "https://example.com/real" },
          { title: "Invented", url: "https://example.com/invented" },
        ],
      },
    });

    await generateStudyMaterial(MATERIAL_ID, TOPIC.id, "worked_example");

    expect(setStudyMaterialReady).toHaveBeenCalledWith(MATERIAL_ID, "body", [
      { title: "Real", url: "https://example.com/real" },
    ]);
  });

  it("refuses instead of fabricating when curriculum, accumulated, and web grounding are all thin", async () => {
    getCurriculumContextForTopic.mockResolvedValue(CURRICULUM_CTX);
    getCurriculumGroundingText.mockResolvedValue("");
    listGapsForTopic.mockResolvedValue([]);
    webSearch.mockResolvedValue({ ok: true, text: "", citations: [] });

    await generateStudyMaterial(MATERIAL_ID, TOPIC.id, "worked_example");

    expect(generate).not.toHaveBeenCalled();
    expect(setStudyMaterialReady).not.toHaveBeenCalled();
    expect(setStudyMaterialFailed).toHaveBeenCalledWith(MATERIAL_ID, expect.any(String));
  });

  it("counts a thin curriculum tier plus a thin accumulated tier as usable once combined, without ever reaching the web", async () => {
    getCurriculumContextForTopic.mockResolvedValue(CURRICULUM_CTX);
    getCurriculumGroundingText.mockResolvedValue("x".repeat(120));
    listGapsForTopic.mockResolvedValue([
      { id: "g1", topicId: TOPIC.id, label: "y".repeat(120), depth: "working", origin: "ai", state: "open", wanted: true, concern: null, lastEvaluatedAt: null },
    ]);
    getCurriculumCitableUrls.mockResolvedValue(["https://example.com/thin-curriculum-src"]);
    generate.mockResolvedValue({
      object: {
        body: "body",
        citations: [{ title: "Thin curriculum source", url: "https://example.com/thin-curriculum-src" }],
      },
    });

    await generateStudyMaterial(MATERIAL_ID, TOPIC.id, "worked_example");

    expect(webSearch).not.toHaveBeenCalled();
    expect(setStudyMaterialReady).toHaveBeenCalledWith(MATERIAL_ID, "body", [
      { title: "Thin curriculum source", url: "https://example.com/thin-curriculum-src" },
    ]);
    expect(setStudyMaterialFailed).not.toHaveBeenCalled();
  });

  it("falls through to web search only once curriculum and accumulated text are both insufficient", async () => {
    getCurriculumContextForTopic.mockResolvedValue(null);
    listGapsForTopic.mockResolvedValue([]);
    webSearch.mockResolvedValue({
      ok: true,
      text: "x".repeat(250),
      citations: ["https://example.com/web"],
    });
    generate.mockResolvedValue({ object: { body: "body", citations: [] } });

    await generateStudyMaterial(MATERIAL_ID, TOPIC.id, "worked_example");

    expect(webSearch).toHaveBeenCalledTimes(1);
    expect(setStudyMaterialReady).toHaveBeenCalled();
  });

  it("sets status failed with a reason, never leaving a row stuck generating, when the writer agent throws", async () => {
    getCurriculumContextForTopic.mockResolvedValue(CURRICULUM_CTX);
    getCurriculumGroundingText.mockResolvedValue("x".repeat(250));
    getCurriculumCitableUrls.mockResolvedValue([]);
    generate.mockRejectedValue(new Error("agent boom"));

    await generateStudyMaterial(MATERIAL_ID, TOPIC.id, "worked_example");

    expect(setStudyMaterialFailed).toHaveBeenCalledWith(MATERIAL_ID, expect.any(String));
  });
});
