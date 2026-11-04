import type http from "node:http";
import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({
  abandonLearningPath: vi.fn(),
  gatherPathProgressInputs: vi.fn(),
  gatherStepPushCandidates: vi.fn(),
  getLearningPath: vi.fn(),
  getSubjectIdByName: vi.fn(),
  listLearningPaths: vi.fn(),
  listNamedNodesForSubject: vi.fn(),
  markLearningPathCompletedIfDue: vi.fn(),
}));
const createLearningPathFromTemplate = vi.hoisted(() => vi.fn());

vi.mock("./learning-path.repo.js", () => repo);
vi.mock("./learning-path-creation.orchestrator.js", () => ({ createLearningPathFromTemplate }));
vi.mock("../probe/probe.service.js", () => ({ buildProbeQuestionForGap: vi.fn() }));
vi.mock("../shared/log.js", () => ({ log: { warn: vi.fn(), error: vi.fn() } }));

import {
  handleAbandonLearningPath,
  handleCreateLearningPath,
  handleGetLearningPath,
  handleGetLearningPathStepPush,
  handleListLearningPaths,
  handleListRoleTemplates,
} from "./learning-path.controller.js";

function fakeReq(body: unknown): http.IncomingMessage {
  return Readable.from([Buffer.from(JSON.stringify(body))]) as unknown as http.IncomingMessage;
}

function fakeRes() {
  const res = { writeHead: vi.fn(), end: vi.fn() };

  return res as unknown as http.ServerResponse & typeof res;
}

function sent(res: ReturnType<typeof fakeRes>): { status: number; body: unknown } {
  return {
    status: vi.mocked(res.writeHead).mock.calls[0]![0] as number,
    body: JSON.parse(vi.mocked(res.end).mock.calls[0]![0] as string),
  };
}

beforeEach(() => {
  Object.values(repo).forEach((fn) => fn.mockReset());
  createLearningPathFromTemplate.mockReset();
});

describe("handleListRoleTemplates", () => {
  it("should answer an empty list when the base subject does not exist", async () => {
    repo.getSubjectIdByName.mockResolvedValue(null);
    const res = fakeRes();

    await handleListRoleTemplates(res);

    expect(sent(res)).toEqual({ status: 200, body: [] });
  });
});

describe("handleCreateLearningPath", () => {
  it("should answer 400 when no role template is named", async () => {
    const res = fakeRes();

    await handleCreateLearningPath(fakeReq({}), res);

    expect(sent(res).status).toBe(400);
    expect(createLearningPathFromTemplate).not.toHaveBeenCalled();
  });

  it("should answer 404 role_template_not_found for an unknown template", async () => {
    createLearningPathFromTemplate.mockResolvedValue({ error: "role_template_not_found" });
    const res = fakeRes();

    await handleCreateLearningPath(fakeReq({ roleTemplateId: "x" }), res);

    expect(sent(res)).toEqual({ status: 404, body: { error: "role_template_not_found" } });
  });

  it("should answer 404 subject_not_found when the base subject is missing", async () => {
    createLearningPathFromTemplate.mockResolvedValue({ error: "subject_not_found" });
    const res = fakeRes();

    await handleCreateLearningPath(fakeReq({ roleTemplateId: "x" }), res);

    expect(sent(res)).toEqual({ status: 404, body: { error: "subject_not_found" } });
  });

  it("should answer 422 with the reason when a target cannot be resolved", async () => {
    createLearningPathFromTemplate.mockRejectedValue(new Error("no node named Git"));
    const res = fakeRes();

    await handleCreateLearningPath(fakeReq({ roleTemplateId: "x" }), res);

    expect(sent(res)).toEqual({
      status: 422,
      body: { error: "unresolved_target", message: "no node named Git" },
    });
  });

  it("should answer 201 with the created path", async () => {
    createLearningPathFromTemplate.mockResolvedValue({ id: "p1" });
    const res = fakeRes();

    await handleCreateLearningPath(fakeReq({ roleTemplateId: "frontend" }), res);

    expect(createLearningPathFromTemplate).toHaveBeenCalledWith("frontend");
    expect(sent(res)).toEqual({ status: 201, body: { id: "p1" } });
  });
});

describe("handleListLearningPaths", () => {
  it("should hide abandoned paths only when asked for active ones", async () => {
    repo.listLearningPaths.mockResolvedValue([]);

    await handleListLearningPaths(fakeRes(), "active");
    await handleListLearningPaths(fakeRes(), null);

    expect(repo.listLearningPaths).toHaveBeenNthCalledWith(1, { excludeAbandoned: true });
    expect(repo.listLearningPaths).toHaveBeenNthCalledWith(2, { excludeAbandoned: false });
  });
});

describe("handleGetLearningPath", () => {
  it("should answer 404 for an unknown path", async () => {
    repo.getLearningPath.mockResolvedValue(null);
    const res = fakeRes();

    await handleGetLearningPath(res, "nope");

    expect(sent(res)).toEqual({ status: 404, body: { error: "not_found" } });
  });
});

describe("handleAbandonLearningPath", () => {
  it("should answer 400 when the status is not abandoned", async () => {
    const res = fakeRes();

    await handleAbandonLearningPath(fakeReq({ status: "active" }), res, "p1");

    expect(sent(res).status).toBe(400);
    expect(repo.abandonLearningPath).not.toHaveBeenCalled();
  });

  it("should answer 404 for an unknown path", async () => {
    repo.abandonLearningPath.mockResolvedValue(null);
    const res = fakeRes();

    await handleAbandonLearningPath(fakeReq({ status: "abandoned" }), res, "nope");

    expect(sent(res)).toEqual({ status: 404, body: { error: "not_found" } });
  });

  it("should answer 200 with the abandoned path", async () => {
    repo.abandonLearningPath.mockResolvedValue({ id: "p1", status: "abandoned" });
    const res = fakeRes();

    await handleAbandonLearningPath(fakeReq({ status: "abandoned" }), res, "p1");

    expect(sent(res)).toEqual({ status: 200, body: { id: "p1", status: "abandoned" } });
  });

  it("should answer 200 with the path still completed when it was already finished", async () => {
    repo.abandonLearningPath.mockResolvedValue({ id: "p1", status: "completed" });
    const res = fakeRes();

    await handleAbandonLearningPath(fakeReq({ status: "abandoned" }), res, "p1");

    expect(sent(res)).toEqual({ status: 200, body: { id: "p1", status: "completed" } });
  });
});

describe("handleGetLearningPathStepPush", () => {
  it("should answer 404 for an unknown path", async () => {
    repo.getLearningPath.mockResolvedValue(null);
    const res = fakeRes();

    await handleGetLearningPathStepPush(res, "nope", "n1");

    expect(sent(res)).toEqual({ status: 404, body: { error: "not_found" } });
  });

  it("should answer 404 step_not_found when the step is not part of the path", async () => {
    repo.getLearningPath.mockResolvedValue({ path: {}, steps: [{ domainNodeId: "n1" }] });
    const res = fakeRes();

    await handleGetLearningPathStepPush(res, "p1", "other");

    expect(sent(res)).toEqual({ status: 404, body: { error: "step_not_found" } });
  });
});
