import { beforeEach, describe, expect, it, vi } from "vitest";

const callOrder: string[] = [];

const generate = vi.fn();

vi.mock("../mastra/mastra.js", () => ({
  AGENT_KEYS: { lectureSourceSelector: "lectureSourceSelector", lectureCompiler: "lectureCompiler" },
  getMastra: () => ({ getAgent: () => ({ generate }) }),
}));

const getTopicRow = vi.fn();

vi.mock("../topic/topic-progress.repo.js", () => ({
  getTopicRow: (id: string) => getTopicRow(id),
}));

const getCurriculumContextForTopic = vi.fn();
const getCurriculumPromptContext = vi.fn();
const getCurriculumGroundingText = vi.fn();
const getCurriculumCitableUrls = vi.fn();

vi.mock("../curriculum/curriculum.repo.js", () => ({
  getCurriculumContextForTopic: (id: string) => getCurriculumContextForTopic(id),
  getCurriculumPromptContext: (id: string) => getCurriculumPromptContext(id),
  getCurriculumGroundingText: (id: string) => {
    callOrder.push("getCurriculumGroundingText");
    return getCurriculumGroundingText(id);
  },
  getCurriculumCitableUrls: (id: string) => getCurriculumCitableUrls(id),
}));

const gatherLectureSourceGrounding = vi.fn();

vi.mock("../curriculum/tech-research-grounding.js", () => ({
  gatherLectureSourceGrounding: (title: string, ctx?: string) => {
    callOrder.push("gatherLectureSourceGrounding");
    return gatherLectureSourceGrounding(title, ctx);
  },
}));

const resolveSourceText = vi.fn();

vi.mock("../curriculum/source-fetch.js", () => ({
  resolveSourceText: (kind: string, url: string) => resolveSourceText(kind, url),
}));

const clearRegatherableCandidates = vi.fn();
const insertLectureSourceCandidates = vi.fn();
const listApprovedCandidatesForCompile = vi.fn();
const listLectureSourceCandidates = vi.fn();
const storeCandidateFetchedText = vi.fn();

vi.mock("./lecture-source-candidate.repo.js", () => ({
  clearRegatherableCandidates: (id: string) => clearRegatherableCandidates(id),
  insertLectureSourceCandidates: (id: string, candidates: unknown[]) =>
    insertLectureSourceCandidates(id, candidates),
  listApprovedCandidatesForCompile: (id: string) => listApprovedCandidatesForCompile(id),
  listLectureSourceCandidates: (id: string) => listLectureSourceCandidates(id),
  storeCandidateFetchedText: (id: string, text: string) => storeCandidateFetchedText(id, text),
}));

const replaceLectureContent = vi.fn();
const setLectureStatus = vi.fn();

vi.mock("./lecture.repo.js", () => ({
  replaceLectureContent: (id: string, plan: unknown) => replaceLectureContent(id, plan),
  setLectureStatus: (id: string, status: string) => setLectureStatus(id, status),
}));

const resolveCourseGroundingSources = vi.fn();

vi.mock("./course-source-grounding.js", () => ({
  resolveCourseGroundingSources: (id: string) => resolveCourseGroundingSources(id),
}));

vi.mock("../shared/log.js", () => ({
  log: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const { gatherLectureSources, compileLecture } = await import("./lecture.orchestrator.js");

const TOPIC = { id: "t1", title: "TCP handshake" };
const CURRICULUM_CTX = { curriculumId: "c1", status: "confirmed", speed: "normal", hinting: false };
const PROMPT_CTX = { curriculumName: "Networking", subjectName: "CS" };

describe("gatherLectureSources", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    callOrder.length = 0;
    getTopicRow.mockResolvedValue(TOPIC);
    getCurriculumContextForTopic.mockResolvedValue(CURRICULUM_CTX);
    getCurriculumPromptContext.mockResolvedValue(PROMPT_CTX);
    gatherLectureSourceGrounding.mockResolvedValue({ text: "web notes", citations: [] });
    generate.mockResolvedValue({ object: { candidates: [] } });
    insertLectureSourceCandidates.mockResolvedValue([]);
    listLectureSourceCandidates.mockResolvedValue([]);
  });

  it("checks the curriculum's own stored sources before running web search", async () => {
    getCurriculumGroundingText.mockResolvedValue("x".repeat(250));
    getCurriculumCitableUrls.mockResolvedValue(["https://example.com/curriculum-src"]);

    await gatherLectureSources(TOPIC.id);

    expect(callOrder).toEqual(["getCurriculumGroundingText", "gatherLectureSourceGrounding"]);
  });

  it("offers the curriculum's own usable sources as candidates, ahead of web-discovered ones", async () => {
    getCurriculumGroundingText.mockResolvedValue("x".repeat(250));
    getCurriculumCitableUrls.mockResolvedValue(["https://example.com/curriculum-src"]);
    gatherLectureSourceGrounding.mockResolvedValue({
      text: "web notes",
      citations: ["https://example.com/web-src"],
    });
    generate.mockResolvedValue({
      object: {
        candidates: [
          { title: "Web source", url: "https://example.com/web-src", whySelected: "found via web" },
        ],
      },
    });

    await gatherLectureSources(TOPIC.id);

    const inserted = insertLectureSourceCandidates.mock.calls[0]?.[1] as { url: string }[];

    expect(inserted.map((c) => c.url)).toEqual([
      "https://example.com/curriculum-src",
      "https://example.com/web-src",
    ]);
  });

  it("never lets a web-discovered candidate replace a curriculum candidate with the same url", async () => {
    getCurriculumGroundingText.mockResolvedValue("x".repeat(250));
    getCurriculumCitableUrls.mockResolvedValue(["https://example.com/shared"]);
    gatherLectureSourceGrounding.mockResolvedValue({
      text: "web notes",
      citations: ["https://example.com/shared"],
    });
    generate.mockResolvedValue({
      object: {
        candidates: [
          { title: "Different title from web", url: "https://example.com/shared", whySelected: "x" },
        ],
      },
    });

    await gatherLectureSources(TOPIC.id);

    const inserted = insertLectureSourceCandidates.mock.calls[0]?.[1] as { title: string; url: string }[];

    expect(inserted).toHaveLength(1);
    expect(inserted[0]?.title).toBe("Curriculum source: https://example.com/shared");
  });

  it("still runs web search, unchanged, when the curriculum has no usable source text", async () => {
    getCurriculumGroundingText.mockResolvedValue("");
    gatherLectureSourceGrounding.mockResolvedValue({
      text: "web notes",
      citations: ["https://example.com/web-src"],
    });
    generate.mockResolvedValue({
      object: {
        candidates: [
          { title: "Web source", url: "https://example.com/web-src", whySelected: "found via web" },
        ],
      },
    });

    await gatherLectureSources(TOPIC.id);

    expect(gatherLectureSourceGrounding).toHaveBeenCalled();
    expect(getCurriculumCitableUrls).not.toHaveBeenCalled();

    const inserted = insertLectureSourceCandidates.mock.calls[0]?.[1] as { url: string }[];

    expect(inserted.map((c) => c.url)).toEqual(["https://example.com/web-src"]);
  });
});

describe("compileLecture", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveCourseGroundingSources.mockResolvedValue(null);
  });

  it("refuses instead of fabricating when every approved source has zero usable grounding text", async () => {
    listApprovedCandidatesForCompile.mockResolvedValue([
      { id: "cand1", title: "Empty source", url: "https://example.com/empty", fetchedText: "" },
    ]);

    await compileLecture(TOPIC.id);

    expect(generate).not.toHaveBeenCalled();
    expect(replaceLectureContent).not.toHaveBeenCalled();
    expect(setLectureStatus).toHaveBeenCalledWith(TOPIC.id, "failed");
  });

  it("refuses when there are no approved candidates at all", async () => {
    listApprovedCandidatesForCompile.mockResolvedValue([]);

    await compileLecture(TOPIC.id);

    expect(generate).not.toHaveBeenCalled();
    expect(setLectureStatus).toHaveBeenCalledWith(TOPIC.id, "failed");
  });

  it("compiles normally when approved sources carry usable grounding text", async () => {
    listApprovedCandidatesForCompile.mockResolvedValue([
      {
        id: "cand1",
        title: "Real source",
        url: "https://example.com/real",
        fetchedText: "x".repeat(250),
      },
    ]);
    generate.mockResolvedValue({
      object: {
        title: "TCP handshake",
        sections: [{ heading: "Overview", body: "..." }],
        citations: [{ title: "Real source", url: "https://example.com/real" }],
      },
    });

    await compileLecture(TOPIC.id);

    expect(generate).toHaveBeenCalled();
    expect(replaceLectureContent).toHaveBeenCalledWith(TOPIC.id, expect.objectContaining({
      title: "TCP handshake",
    }));
    expect(setLectureStatus).not.toHaveBeenCalled();
  });

  it("compiles from the course's own sources without ever consulting approved candidates", async () => {
    resolveCourseGroundingSources.mockResolvedValue([
      {
        title: "Captured article",
        url: "https://example.com/captured",
        text: "x".repeat(250),
      },
    ]);
    generate.mockResolvedValue({
      object: {
        title: "TCP handshake",
        sections: [{ heading: "Overview", body: "..." }],
        citations: [{ title: "Captured article", url: "https://example.com/captured" }],
      },
    });

    await compileLecture(TOPIC.id);

    expect(listApprovedCandidatesForCompile).not.toHaveBeenCalled();
    expect(generate).toHaveBeenCalled();
    expect(replaceLectureContent).toHaveBeenCalledWith(TOPIC.id, expect.objectContaining({
      title: "TCP handshake",
    }));
    expect(setLectureStatus).not.toHaveBeenCalled();
  });

  it("still fails cleanly, without inventing content, when the course's own source text is too short", async () => {
    resolveCourseGroundingSources.mockResolvedValue([
      { title: "Thin article", url: "https://example.com/thin", text: "too short" },
    ]);

    await compileLecture(TOPIC.id);

    expect(listApprovedCandidatesForCompile).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
    expect(replaceLectureContent).not.toHaveBeenCalled();
    expect(setLectureStatus).toHaveBeenCalledWith(TOPIC.id, "failed");
  });
});
