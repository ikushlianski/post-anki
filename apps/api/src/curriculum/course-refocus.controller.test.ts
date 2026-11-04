import type http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listCourseRefocusSuggestions = vi.fn();
const dismissCourseRefocusSuggestion = vi.fn();
const logError = vi.fn();

vi.mock("./course-refocus.repo.js", () => ({
  listCourseRefocusSuggestions: (...args: unknown[]) => listCourseRefocusSuggestions(...args),
  dismissCourseRefocusSuggestion: (...args: unknown[]) => dismissCourseRefocusSuggestion(...args),
}));

vi.mock("../shared/log.js", () => ({
  log: { error: (...args: unknown[]) => logError(...args), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const { handleListCourseRefocusSuggestions, handleDismissCourseRefocusSuggestion } = await import(
  "./course-refocus.controller.js"
);

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

describe("course refocus controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should list the open refocus suggestions", async () => {
    listCourseRefocusSuggestions.mockResolvedValue([{ id: "c1" }]);
    const res = fakeRes();

    await handleListCourseRefocusSuggestions(res);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: "c1" }]);
  });

  it("should answer 500 and log through the structured logger when listing fails", async () => {
    const err = new Error("db down");

    listCourseRefocusSuggestions.mockRejectedValue(err);
    const res = fakeRes();

    await handleListCourseRefocusSuggestions(res);

    expect(res.status).toBe(500);
    expect(logError).toHaveBeenCalledWith({ err }, "course_refocus_list_failed");
  });

  it("should answer 400 when the reason is missing and dismiss nothing", async () => {
    const res = fakeRes();

    await handleDismissCourseRefocusSuggestion(res, "c1", "");

    expect(res.status).toBe(400);
    expect(dismissCourseRefocusSuggestion).not.toHaveBeenCalled();
  });

  it("should dismiss the suggestion with the given reason", async () => {
    dismissCourseRefocusSuggestion.mockResolvedValue(undefined);
    const res = fakeRes();

    await handleDismissCourseRefocusSuggestion(res, "c1", "not now");

    expect(res.status).toBe(200);
    expect(dismissCourseRefocusSuggestion).toHaveBeenCalledWith("c1", "not now");
  });

  it("should answer 500 and log through the structured logger when dismissing fails", async () => {
    const err = new Error("db down");

    dismissCourseRefocusSuggestion.mockRejectedValue(err);
    const res = fakeRes();

    await handleDismissCourseRefocusSuggestion(res, "c1", "not now");

    expect(res.status).toBe(500);
    expect(logError).toHaveBeenCalledWith({ err }, "course_refocus_dismiss_failed");
  });
});
