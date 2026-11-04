import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeReq, fakeRes } from "../shared/fake-http.test-mocks.js";

const dispatchBackgroundJob = vi.fn();
const getTopicRow = vi.fn();
const insertGeneratingStudyMaterial = vi.fn();
const failStaleGeneratingStudyMaterials = vi.fn();
const listStudyMaterialsForTopic = vi.fn();

vi.mock("../background-job/background-job.starter.js", () => ({
  dispatchBackgroundJob: (...args: unknown[]) => dispatchBackgroundJob(...args),
}));

vi.mock("../topic/topic-progress.repo.js", () => ({
  getTopicRow: (...args: unknown[]) => getTopicRow(...args),
}));

vi.mock("../shared/log.js", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

vi.mock("./study-material.orchestrator.js", () => ({
  generateStudyMaterial: vi.fn(),
}));

vi.mock("./study-material.repo.js", () => ({
  insertGeneratingStudyMaterial: (...args: unknown[]) => insertGeneratingStudyMaterial(...args),
  failStaleGeneratingStudyMaterials: (...args: unknown[]) => failStaleGeneratingStudyMaterials(...args),
  listStudyMaterialsForTopic: (...args: unknown[]) => listStudyMaterialsForTopic(...args),
}));

const { handleListStudyMaterials, handleRequestStudyMaterial } = await import(
  "./study-material.controller.js"
);

describe("request study material", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should answer 400 and start nothing when the kind is unknown", async () => {
    const res = fakeRes();

    await handleRequestStudyMaterial(fakeReq(JSON.stringify({ kind: "bogus" })), res, "t1");

    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe("invalid_input");
    expect(insertGeneratingStudyMaterial).not.toHaveBeenCalled();
    expect(dispatchBackgroundJob).not.toHaveBeenCalled();
  });

  it("should answer 404 and start nothing when the topic does not exist", async () => {
    getTopicRow.mockResolvedValue(null);
    const res = fakeRes();

    await handleRequestStudyMaterial(fakeReq(JSON.stringify({ kind: "analogy" })), res, "missing");

    expect(res.status).toBe(404);
    expect(insertGeneratingStudyMaterial).not.toHaveBeenCalled();
    expect(dispatchBackgroundJob).not.toHaveBeenCalled();
  });

  it("should answer 202 with the generating material and dispatch one job", async () => {
    getTopicRow.mockResolvedValue({ id: "t1" });
    insertGeneratingStudyMaterial.mockResolvedValue({ id: "m1", status: "generating" });
    const res = fakeRes();

    await handleRequestStudyMaterial(fakeReq(JSON.stringify({ kind: "analogy" })), res, "t1");

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ id: "m1", status: "generating" });
    expect(dispatchBackgroundJob).toHaveBeenCalledTimes(1);
    expect(dispatchBackgroundJob.mock.calls[0]?.[0]).toEqual({
      kind: "study-material",
      materialId: "m1",
      topicId: "t1",
      materialKind: "analogy",
    });
  });
});

describe("list study materials", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should answer 404 and touch nothing when the topic does not exist", async () => {
    getTopicRow.mockResolvedValue(null);
    const res = fakeRes();

    await handleListStudyMaterials(res, "missing");

    expect(res.status).toBe(404);
    expect(failStaleGeneratingStudyMaterials).not.toHaveBeenCalled();
    expect(listStudyMaterialsForTopic).not.toHaveBeenCalled();
  });

  it("should clear stale generating rows before answering 200 with the list", async () => {
    getTopicRow.mockResolvedValue({ id: "t1" });
    listStudyMaterialsForTopic.mockResolvedValue([{ id: "m1" }]);
    const res = fakeRes();

    await handleListStudyMaterials(res, "t1");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: "m1" }]);
    expect(failStaleGeneratingStudyMaterials.mock.invocationCallOrder[0]).toBeLessThan(
      listStudyMaterialsForTopic.mock.invocationCallOrder[0] as number,
    );
  });
});
