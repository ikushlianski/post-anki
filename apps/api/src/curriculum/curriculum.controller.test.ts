import { Readable } from "node:stream";
import type http from "node:http";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Curriculum, StructureTurn } from "@post-anki/shared";

const getCurriculum = vi.fn();
const getApprovableSourceCount = vi.fn();
const getStructureTurns = vi.fn();
const setCurriculumStatus = vi.fn();

vi.mock("./curriculum.repo.js", () => ({
  getCurriculum: (...args: unknown[]) => getCurriculum(...args),
  getApprovableSourceCount: (...args: unknown[]) => getApprovableSourceCount(...args),
  getStructureTurns: (...args: unknown[]) => getStructureTurns(...args),
  setCurriculumStatus: (...args: unknown[]) => setCurriculumStatus(...args),
}));

const generateCurriculumFromApprovedSources = vi.fn();

vi.mock("./curriculum-parse.orchestrator.js", () => ({
  generateCurriculumFromApprovedSources: (...args: unknown[]) =>
    generateCurriculumFromApprovedSources(...args),
}));

const retryDraftStructure = vi.fn();

vi.mock("./curriculum-structure.js", () => ({
  retryDraftStructure: (...args: unknown[]) => retryDraftStructure(...args),
}));

vi.mock("../shared/log.js", () => ({
  log: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const { handleApproveSources, handleRetryDraftStructure } = await import(
  "./curriculum.controller.js"
);

function fakeReq(body: unknown): http.IncomingMessage {
  const readable = new Readable({
    read() {
      this.push(JSON.stringify(body));
      this.push(null);
    },
  });

  return readable as unknown as http.IncomingMessage;
}

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

function makeCurriculum(overrides: Partial<Curriculum> = {}): Curriculum {
  return {
    id: "cur_1",
    subjectId: "sub_1",
    name: "Event-Driven Systems",
    status: "awaiting_source_approval",
    learningStatus: "not_started",
    speed: "normal",
    hinting: true,
    defaultDepth: "working",
    origin: "research",
    strictOrder: false,
    preAssessmentCompletedAt: null,
    domainNodeId: null,
    ...overrides,
  };
}

function makeTurn(overrides: Partial<StructureTurn> = {}): StructureTurn {
  return {
    id: "turn_1",
    curriculumId: "cur_1",
    role: "assistant",
    message: "Drafting the first version of the structure…",
    structureSnapshot: null,
    splitSuggestion: null,
    toolActions: [],
    status: "pending",
    pendingResearchCandidates: [],
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("handleApproveSources", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getApprovableSourceCount.mockResolvedValue(1);
    generateCurriculumFromApprovedSources.mockResolvedValue(undefined);
  });

  it("writes shaping_structure and awaits it before sending the response and dispatching generation", async () => {
    getCurriculum.mockResolvedValue(makeCurriculum());

    const callOrder: string[] = [];

    setCurriculumStatus.mockImplementation(async () => {
      await Promise.resolve();
      callOrder.push("statusPersisted");
    });

    const res = fakeRes();
    const originalEnd = res.end.bind(res);

    (res as unknown as { end: (payload?: string) => void }).end = (payload?: string) => {
      callOrder.push("sendJson");
      originalEnd(payload);
    };

    generateCurriculumFromApprovedSources.mockImplementation(async () => {
      callOrder.push("generateCurriculumFromApprovedSources");
    });

    await handleApproveSources(fakeReq({}), res, "cur_1");

    expect(callOrder.indexOf("statusPersisted")).toBeGreaterThanOrEqual(0);
    expect(callOrder.indexOf("statusPersisted")).toBeLessThan(callOrder.indexOf("sendJson"));
    expect(callOrder.indexOf("sendJson")).toBeLessThan(
      callOrder.indexOf("generateCurriculumFromApprovedSources"),
    );
    expect(setCurriculumStatus).toHaveBeenCalledWith("cur_1", "shaping_structure");
  });

  it("reports the real persisted status in the 202 body instead of a fabricated one", async () => {
    getCurriculum.mockResolvedValue(makeCurriculum());

    const res = fakeRes();

    await handleApproveSources(fakeReq({}), res, "cur_1");

    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ status: "shaping_structure" });
  });

  it("refuses a second approve for a curriculum the first call already moved past awaiting_source_approval", async () => {
    getCurriculum.mockResolvedValue(makeCurriculum({ status: "shaping_structure" }));

    const res = fakeRes();

    await handleApproveSources(fakeReq({}), res, "cur_1");

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: "not_awaiting_approval" });
    expect(setCurriculumStatus).not.toHaveBeenCalled();
    expect(generateCurriculumFromApprovedSources).not.toHaveBeenCalled();
  });

  it("sets status failed when the dispatch throws before generateDraftStructure's placeholder insert", async () => {
    getCurriculum.mockResolvedValue(makeCurriculum());
    generateCurriculumFromApprovedSources.mockRejectedValue(new Error("boom"));

    const res = fakeRes();

    await handleApproveSources(fakeReq({}), res, "cur_1");

    await vi.waitFor(() => {
      expect(setCurriculumStatus).toHaveBeenCalledWith("cur_1", "failed");
    });
  });

  it("does not let a failed status write itself become an unhandled rejection", async () => {
    getCurriculum.mockResolvedValue(makeCurriculum());
    generateCurriculumFromApprovedSources.mockRejectedValue(new Error("boom"));
    setCurriculumStatus.mockImplementation(async (_id: string, status: string) => {
      if (status === "failed") {
        throw new Error("db unavailable");
      }
    });

    const unhandled = vi.fn();

    process.once("unhandledRejection", unhandled);

    const res = fakeRes();

    await handleApproveSources(fakeReq({}), res, "cur_1");

    await vi.waitFor(() => {
      expect(setCurriculumStatus).toHaveBeenCalledWith("cur_1", "failed");
    });

    await new Promise((resolve) => setImmediate(resolve));

    expect(unhandled).not.toHaveBeenCalled();

    process.removeListener("unhandledRejection", unhandled);
  });
});

describe("handleRetryDraftStructure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    retryDraftStructure.mockResolvedValue(undefined);
  });

  it("accepts a failed curriculum and writes shaping_structure before its 202", async () => {
    getCurriculum.mockResolvedValue(makeCurriculum({ status: "failed" }));

    const callOrder: string[] = [];

    setCurriculumStatus.mockImplementation(async () => {
      await Promise.resolve();
      callOrder.push("statusPersisted");
    });

    const res = fakeRes();
    const originalEnd = res.end.bind(res);

    (res as unknown as { end: (payload?: string) => void }).end = (payload?: string) => {
      callOrder.push("sendJson");
      originalEnd(payload);
    };

    await handleRetryDraftStructure(res, "cur_1");

    expect(callOrder.indexOf("statusPersisted")).toBeGreaterThanOrEqual(0);
    expect(callOrder.indexOf("statusPersisted")).toBeLessThan(callOrder.indexOf("sendJson"));
    expect(setCurriculumStatus).toHaveBeenCalledWith("cur_1", "shaping_structure");
    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ status: "shaping_structure" });
    expect(retryDraftStructure).toHaveBeenCalledWith("cur_1");
  });

  it("accepts a shaping_structure curriculum whose turns are stalled, determined server-side", async () => {
    getCurriculum.mockResolvedValue(makeCurriculum({ status: "shaping_structure" }));
    getStructureTurns.mockResolvedValue([
      makeTurn({ createdAt: new Date(Date.now() - 10 * 60 * 1000).toISOString() }),
    ]);

    const res = fakeRes();

    await handleRetryDraftStructure(res, "cur_1");

    expect(res.status).toBe(202);
    expect(setCurriculumStatus).toHaveBeenCalledWith("cur_1", "shaping_structure");
  });

  it("refuses a shaping_structure curriculum whose pending turn is still fresh, not stalled", async () => {
    getCurriculum.mockResolvedValue(makeCurriculum({ status: "shaping_structure" }));
    getStructureTurns.mockResolvedValue([makeTurn({ createdAt: new Date().toISOString() })]);

    const res = fakeRes();

    await handleRetryDraftStructure(res, "cur_1");

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: "not_failed" });
    expect(setCurriculumStatus).not.toHaveBeenCalled();
    expect(retryDraftStructure).not.toHaveBeenCalled();
  });

  it("refuses every other status", async () => {
    getCurriculum.mockResolvedValue(makeCurriculum({ status: "ready" }));

    const res = fakeRes();

    await handleRetryDraftStructure(res, "cur_1");

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: "not_failed" });
    expect(getStructureTurns).not.toHaveBeenCalled();
  });

  it("404s for a curriculum that does not exist", async () => {
    getCurriculum.mockResolvedValue(null);

    const res = fakeRes();

    await handleRetryDraftStructure(res, "missing");

    expect(res.status).toBe(404);
    expect(setCurriculumStatus).not.toHaveBeenCalled();
  });
});
