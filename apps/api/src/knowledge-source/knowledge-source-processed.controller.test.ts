import type http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./knowledge-source-processed.repo.js", () => ({
  setKnowledgeSourceProcessed: vi.fn(),
}));

const { setKnowledgeSourceProcessed } = await import("./knowledge-source-processed.repo.js");
const { handleMarkKnowledgeSourceProcessed, handleReopenKnowledgeSource } = await import(
  "./knowledge-source-processed.controller.js"
);

function fakeRes() {
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

  return res;
}

describe("processed controller", () => {
  beforeEach(() => {
    vi.mocked(setKnowledgeSourceProcessed).mockReset();
  });

  it("should answer 200 with the processed time", async () => {
    const processedAt = new Date("2026-10-11T10:00:00.000Z");
    vi.mocked(setKnowledgeSourceProcessed).mockResolvedValue({ ok: true, id: "ks_1", processedAt });
    const res = fakeRes();

    await handleMarkKnowledgeSourceProcessed(res as unknown as http.ServerResponse, "ks_1");

    expect(setKnowledgeSourceProcessed).toHaveBeenCalledWith("ks_1", true);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: "ks_1", processedAt: "2026-10-11T10:00:00.000Z" });
  });

  it("should answer 200 with no processed time after reopening", async () => {
    vi.mocked(setKnowledgeSourceProcessed).mockResolvedValue({ ok: true, id: "ks_1", processedAt: null });
    const res = fakeRes();

    await handleReopenKnowledgeSource(res as unknown as http.ServerResponse, "ks_1");

    expect(setKnowledgeSourceProcessed).toHaveBeenCalledWith("ks_1", false);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: "ks_1", processedAt: null });
  });

  it.each(["bad id!", "a".repeat(101), "../x"])(
    "should reject a malformed id without touching the database: %s",
    async (id) => {
      const markRes = fakeRes();
      const reopenRes = fakeRes();

      await handleMarkKnowledgeSourceProcessed(markRes as unknown as http.ServerResponse, id);
      await handleReopenKnowledgeSource(reopenRes as unknown as http.ServerResponse, id);

      expect(markRes.status).toBe(400);
      expect(reopenRes.status).toBe(400);
      expect(markRes.body).toEqual({ error: "invalid_id" });
      expect(setKnowledgeSourceProcessed).not.toHaveBeenCalled();
    },
  );

  it("should answer 404 when the entry is missing", async () => {
    vi.mocked(setKnowledgeSourceProcessed).mockResolvedValue({ ok: false, reason: "not_found" });
    const res = fakeRes();

    await handleReopenKnowledgeSource(res as unknown as http.ServerResponse, "ks_missing");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "not_found" });
  });

  it("should answer 409 while the entry is processing", async () => {
    vi.mocked(setKnowledgeSourceProcessed).mockResolvedValue({ ok: false, reason: "entry_processing" });
    const res = fakeRes();

    await handleMarkKnowledgeSourceProcessed(res as unknown as http.ServerResponse, "ks_busy");

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "entry_processing" });
  });

  it("should answer 409 when the entry still has pending cards", async () => {
    vi.mocked(setKnowledgeSourceProcessed).mockResolvedValue({ ok: false, reason: "pending_items" });
    const res = fakeRes();

    await handleMarkKnowledgeSourceProcessed(res as unknown as http.ServerResponse, "ks_pending");

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "pending_items" });
  });

  it("should not log entry text", async () => {
    const spies = [
      vi.spyOn(console, "log").mockImplementation(() => undefined),
      vi.spyOn(console, "error").mockImplementation(() => undefined),
      vi.spyOn(console, "warn").mockImplementation(() => undefined),
    ];
    vi.mocked(setKnowledgeSourceProcessed).mockResolvedValue({ ok: false, reason: "entry_processing" });

    await handleMarkKnowledgeSourceProcessed(fakeRes() as unknown as http.ServerResponse, "ks_busy");

    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    }
  });
});
