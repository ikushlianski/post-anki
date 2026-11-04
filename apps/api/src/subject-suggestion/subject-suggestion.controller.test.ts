import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeReq, fakeRes } from "../shared/fake-http.test-mocks.js";

const runSubjectSuggestionScan = vi.fn();
const listSubjectSuggestions = vi.fn();
const resolveSubjectSuggestion = vi.fn();

vi.mock("../shared/log.js", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

vi.mock("./subject-suggestion.orchestrator.js", () => ({
  runSubjectSuggestionScan: (...args: unknown[]) => runSubjectSuggestionScan(...args),
}));

vi.mock("./subject-suggestion.repo.js", () => ({
  listSubjectSuggestions: (...args: unknown[]) => listSubjectSuggestions(...args),
  resolveSubjectSuggestion: (...args: unknown[]) => resolveSubjectSuggestion(...args),
}));

const { handleListSubjectSuggestions, handleResolveSubjectSuggestion, handleTriggerSubjectSuggestionScan } =
  await import("./subject-suggestion.controller.js");

describe("resolve a subject suggestion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    { error: "not_found", status: 404 },
    { error: "already_resolved", status: 409 },
    { error: "name_taken", status: 409 },
    { error: "parent_not_found", status: 400 },
    { error: "depth_exceeded", status: 400 },
  ])("should answer $status when the repo reports $error", async ({ error, status }) => {
    resolveSubjectSuggestion.mockResolvedValue({ error });
    const res = fakeRes();

    await handleResolveSubjectSuggestion(fakeReq(JSON.stringify({ action: "dismiss" })), res, "s1");

    expect(res.status).toBe(status);
    expect((res.body as { error: string }).error).toBe(error);
  });

  it("should answer 400 and resolve nothing when the action is unknown", async () => {
    const res = fakeRes();

    await handleResolveSubjectSuggestion(fakeReq(JSON.stringify({ action: "merge" })), res, "s1");

    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe("invalid_input");
    expect(resolveSubjectSuggestion).not.toHaveBeenCalled();
  });

  it("should answer 200 with the resolved suggestion on success", async () => {
    resolveSubjectSuggestion.mockResolvedValue({ id: "s1", status: "dismissed" });
    const res = fakeRes();

    await handleResolveSubjectSuggestion(fakeReq(JSON.stringify({ action: "dismiss" })), res, "s1");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: "s1", status: "dismissed" });
  });
});

describe("list subject suggestions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should answer 400 and list nothing when the status filter is unknown", async () => {
    const res = fakeRes();

    await handleListSubjectSuggestions(res, "bogus");

    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe("invalid_input");
    expect(listSubjectSuggestions).not.toHaveBeenCalled();
  });

  it("should answer 200 with every suggestion when no filter is given", async () => {
    listSubjectSuggestions.mockResolvedValue([{ id: "s1" }]);
    const res = fakeRes();

    await handleListSubjectSuggestions(res, null);

    expect(res.status).toBe(200);
    expect(listSubjectSuggestions).toHaveBeenCalledWith(undefined);
  });
});

describe("trigger a subject suggestion scan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should answer 502 scan_failed when the scan throws", async () => {
    runSubjectSuggestionScan.mockRejectedValue(new Error("boom"));
    const res = fakeRes();

    await handleTriggerSubjectSuggestionScan(res);

    expect(res.status).toBe(502);
    expect((res.body as { error: string }).error).toBe("scan_failed");
  });
});
