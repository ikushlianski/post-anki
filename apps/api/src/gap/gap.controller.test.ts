import { Readable } from "node:stream";
import type http from "node:http";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Gap } from "@post-anki/shared";

const mockTriageGapLocked = vi.fn();
const mockListGapsDueForResurface = vi.fn();
const mockMarkGapResurfaced = vi.fn();

vi.mock("./gap-triage.repo.js", () => ({
  triageGapLocked: (...args: unknown[]) => mockTriageGapLocked(...args),
  listGapsDueForResurface: (...args: unknown[]) => mockListGapsDueForResurface(...args),
  markGapResurfaced: (...args: unknown[]) => mockMarkGapResurfaced(...args),
}));

const { handleTriageGap, handleDueForResurface, handleMarkResurfaced } = await import(
  "./gap.controller.js"
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

function gap(overrides: Partial<Gap> & { id: string }): Gap {
  return {
    topicId: "t1",
    label: "async iterators",
    depth: "working",
    origin: "ai",
    state: "open",
    wanted: false,
    concern: null,
    lastEvaluatedAt: null,
    triageState: "important",
    triagedAt: "2026-05-31T00:00:00.000Z",
    deferredUntil: null,
    deferralCount: 0,
    dismissedAt: null,
    dismissedCheckinSentAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("handleTriageGap", () => {
  it("returns the post-transition gap and changed flag from the locked repo call", async () => {
    mockTriageGapLocked.mockResolvedValue({
      gap: gap({ id: "g1" }),
      changed: true,
      tool: "TypeScript",
    });

    const res = fakeRes();
    await handleTriageGap(fakeReq({ action: "important" }), res, "g1");

    expect(mockTriageGapLocked).toHaveBeenCalledWith("g1", "important", expect.any(String));
    expect(res.status).toBe(200);
    expect((res.body as { changed: boolean }).changed).toBe(true);
  });

  it("404s when the gap does not exist", async () => {
    mockTriageGapLocked.mockResolvedValue(null);

    const res = fakeRes();
    await handleTriageGap(fakeReq({ action: "dismiss" }), res, "missing");

    expect(res.status).toBe(404);
  });

  it("400s on an invalid action", async () => {
    const res = fakeRes();
    await handleTriageGap(fakeReq({ action: "not_a_real_action" }), res, "g1");

    expect(res.status).toBe(400);
    expect(mockTriageGapLocked).not.toHaveBeenCalled();
  });
});

describe("handleDueForResurface", () => {
  it("is read-only — returns whatever the repo layer reports with no write call", async () => {
    mockListGapsDueForResurface.mockResolvedValue({
      userDeferredDue: [{ gap: gap({ id: "g1", triageState: "user_deferred" }), tool: "Docker" }],
      dismissedCheckinDue: [],
    });

    const res = fakeRes();
    await handleDueForResurface(res);

    expect(res.status).toBe(200);
    expect((res.body as { userDeferredDue: unknown[] }).userDeferredDue).toHaveLength(1);
    expect(mockMarkGapResurfaced).not.toHaveBeenCalled();
  });
});

describe("handleMarkResurfaced", () => {
  it("passes the exact kind through to the repo layer", async () => {
    const res = fakeRes();
    await handleMarkResurfaced(fakeReq({ kind: "deferral-expired" }), res, "g1");

    expect(mockMarkGapResurfaced).toHaveBeenCalledWith("g1", "deferral-expired", expect.any(String));
    expect(res.status).toBe(200);
  });

  it("400s on an invalid kind", async () => {
    const res = fakeRes();
    await handleMarkResurfaced(fakeReq({ kind: "not_a_real_kind" }), res, "g1");

    expect(res.status).toBe(400);
    expect(mockMarkGapResurfaced).not.toHaveBeenCalled();
  });
});
