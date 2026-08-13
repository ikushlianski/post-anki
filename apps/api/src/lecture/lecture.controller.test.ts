import { describe, expect, it, vi, beforeEach } from "vitest";
import type http from "node:http";

const getTopicRow = vi.fn();

vi.mock("../topic/topic-progress.repo.js", () => ({
  getTopicRow: (id: string) => getTopicRow(id),
}));

const compileLecture = vi.fn();
const gatherLectureSources = vi.fn();

vi.mock("./lecture.orchestrator.js", () => ({
  compileLecture: (id: string) => compileLecture(id),
  gatherLectureSources: (id: string) => gatherLectureSources(id),
}));

const getLectureByTopic = vi.fn();
const startGeneratingLecture = vi.fn();

vi.mock("./lecture.repo.js", () => ({
  getLectureByTopic: (id: string) => getLectureByTopic(id),
  startGeneratingLecture: (id: string, title: string) => startGeneratingLecture(id, title),
}));

const hasCourseOwnSources = vi.fn();

vi.mock("./course-source-grounding.js", () => ({
  hasCourseOwnSources: (id: string) => hasCourseOwnSources(id),
}));

const listApprovedCandidatesForCompile = vi.fn();

vi.mock("./lecture-source-candidate.repo.js", () => ({
  listApprovedCandidatesForCompile: (id: string) => listApprovedCandidatesForCompile(id),
  listLectureSourceCandidates: vi.fn(),
  updateCandidateReviewStatus: vi.fn(),
}));

vi.mock("../shared/log.js", () => ({
  log: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const { handleCompileLecture } = await import("./lecture.controller.js");

function fakeRes(): http.ServerResponse & { status: number | null; body: unknown } {
  const res = {
    status: null as number | null,
    body: undefined as unknown,
    writeHead(status: number) {
      res.status = status;
      return res;
    },
    end(payload?: string) {
      res.body = payload ? JSON.parse(payload) : undefined;
    },
  };

  return res as unknown as http.ServerResponse & { status: number | null; body: unknown };
}

const TOPIC = { id: "t1", title: "TCP handshake" };

describe("handleCompileLecture", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTopicRow.mockResolvedValue(TOPIC);
    startGeneratingLecture.mockResolvedValue({ id: "lec1", status: "generating" });
    compileLecture.mockResolvedValue(undefined);
  });

  it("skips the approved-candidates gate entirely when the course has its own usable sources", async () => {
    hasCourseOwnSources.mockResolvedValue(true);

    const res = fakeRes();

    await handleCompileLecture(res, TOPIC.id);

    expect(listApprovedCandidatesForCompile).not.toHaveBeenCalled();
    expect(startGeneratingLecture).toHaveBeenCalledWith(TOPIC.id, TOPIC.title);
    expect(res.status).toBe(202);
  });

  it("still requires an approved candidate when the course has no usable own sources", async () => {
    hasCourseOwnSources.mockResolvedValue(false);
    listApprovedCandidatesForCompile.mockResolvedValue([]);

    const res = fakeRes();

    await handleCompileLecture(res, TOPIC.id);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "no_approved_sources" });
    expect(startGeneratingLecture).not.toHaveBeenCalled();
  });

  it("proceeds via the manual flow once a candidate is approved for a research-origin course", async () => {
    hasCourseOwnSources.mockResolvedValue(false);
    listApprovedCandidatesForCompile.mockResolvedValue([
      { id: "cand1", title: "Approved", url: "https://example.com", fetchedText: null },
    ]);

    const res = fakeRes();

    await handleCompileLecture(res, TOPIC.id);

    expect(startGeneratingLecture).toHaveBeenCalledWith(TOPIC.id, TOPIC.title);
    expect(res.status).toBe(202);
  });

  it("404s for a topic that does not exist without touching either gate", async () => {
    getTopicRow.mockResolvedValue(null);

    const res = fakeRes();

    await handleCompileLecture(res, "missing");

    expect(res.status).toBe(404);
    expect(hasCourseOwnSources).not.toHaveBeenCalled();
    expect(startGeneratingLecture).not.toHaveBeenCalled();
  });
});
