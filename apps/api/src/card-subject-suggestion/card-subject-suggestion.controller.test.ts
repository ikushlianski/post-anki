import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeReq, fakeRes } from "../shared/fake-http.test-mocks.js";

const resolveCardSubjectSuggestion = vi.fn();
const listCardSubjectSuggestions = vi.fn();

vi.mock("../shared/log.js", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("./card-subject-suggestion.orchestrator.js", () => ({ runCardSubjectSuggestionScan: vi.fn() }));
vi.mock("./card-subject-suggestion-resolve.repo.js", () => ({
  resolveCardSubjectSuggestion: (...args: unknown[]) => resolveCardSubjectSuggestion(...args),
}));
vi.mock("./card-subject-suggestion.repo.js", () => ({
  listCardSubjectSuggestions: (...args: unknown[]) => listCardSubjectSuggestions(...args),
}));

const { handleListCardSubjectSuggestions, handleResolveCardSubjectSuggestion } = await import(
  "./card-subject-suggestion.controller.js"
);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolve a card subject suggestion", () => {
  it.each([
    { error: "not_found", status: 404 },
    { error: "already_resolved", status: 409 },
    { error: "already_placed", status: 409 },
    { error: "subject_not_found", status: 400 },
  ])("should answer $status when the repo reports $error", async ({ error, status }) => {
    resolveCardSubjectSuggestion.mockResolvedValue({ error });
    const res = fakeRes();

    await handleResolveCardSubjectSuggestion(fakeReq(JSON.stringify({ action: "approve" })), res, "c1");

    expect(res.status).toBe(status);
  });

  it("should answer 400 and change nothing when the action is unknown", async () => {
    const res = fakeRes();

    await handleResolveCardSubjectSuggestion(fakeReq(JSON.stringify({ action: "merge" })), res, "c1");

    expect(res.status).toBe(400);
    expect(resolveCardSubjectSuggestion).not.toHaveBeenCalled();
  });

  it("should return the new status when the learner approves", async () => {
    resolveCardSubjectSuggestion.mockResolvedValue({ status: "approved" });
    const res = fakeRes();

    await handleResolveCardSubjectSuggestion(fakeReq(JSON.stringify({ action: "approve" })), res, "c1");

    expect(res.status).toBe(200);
    expect(resolveCardSubjectSuggestion).toHaveBeenCalledWith("c1", { action: "approve" });
  });
});

describe("list card subject suggestions", () => {
  it("should list only pending suggestions when no status is given", async () => {
    listCardSubjectSuggestions.mockResolvedValue([]);
    const res = fakeRes();

    await handleListCardSubjectSuggestions(res, null);

    expect(listCardSubjectSuggestions).toHaveBeenCalledWith("pending");
    expect(res.status).toBe(200);
  });

  it("should answer 400 for an unknown status filter", async () => {
    const res = fakeRes();

    await handleListCardSubjectSuggestions(res, "bogus");

    expect(res.status).toBe(400);
    expect(listCardSubjectSuggestions).not.toHaveBeenCalled();
  });
});
