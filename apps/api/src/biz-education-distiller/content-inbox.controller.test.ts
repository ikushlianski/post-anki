import type http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../shared/log.js", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

const mockListContentInbox = vi.fn();
const mockDistillBizEducation = vi.fn();

vi.mock("./distiller.repo.js", () => ({
  listContentInbox: (...args: unknown[]) => mockListContentInbox(...args),
}));

vi.mock("./distiller.orchestrator.js", () => ({
  distillBizEducation: (...args: unknown[]) => mockDistillBizEducation(...args),
}));

const { handleListContentInbox, handleTriggerBizEducationDistill } = await import(
  "./content-inbox.controller.js"
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

beforeEach(() => {
  vi.clearAllMocks();
});

describe("handleListContentInbox", () => {
  it("returns 200 with the inbox rows", async () => {
    mockListContentInbox.mockResolvedValue([{ id: "row_1" }]);

    const res = fakeRes();
    await handleListContentInbox(res);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: "row_1" }]);
  });
});

describe("handleTriggerBizEducationDistill", () => {
  it("returns 200 with the distill result on success", async () => {
    mockDistillBizEducation.mockResolvedValue({
      processed: ["n1"],
      skipped: [],
      failed: [],
      markSyncedFailed: [],
    });

    const res = fakeRes();
    await handleTriggerBizEducationDistill(res);

    expect(mockDistillBizEducation).toHaveBeenCalledWith();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      processed: ["n1"],
      skipped: [],
      failed: [],
      markSyncedFailed: [],
    });
  });

  it("returns 502 with an error message when the distill throws, never a silent 200", async () => {
    mockDistillBizEducation.mockRejectedValue(new Error("notion down"));

    const res = fakeRes();
    await handleTriggerBizEducationDistill(res);

    expect(res.status).toBe(502);
    expect((res.body as { error: string }).error).toBe("scan_failed");
    expect((res.body as { message: string }).message).toBe("notion down");
  });

  it("falls back to a generic message when the thrown value is not an Error instance", async () => {
    mockDistillBizEducation.mockRejectedValue("boom");

    const res = fakeRes();
    await handleTriggerBizEducationDistill(res);

    expect(res.status).toBe(502);
    expect((res.body as { message: string }).message).toBe("biz education distill failed");
  });
});
