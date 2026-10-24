import { Readable } from "node:stream";
import type http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./knowledge-bit-triage-undo.repo.js", () => ({ undoTriageKnowledgeBit: vi.fn() }));

const { undoTriageKnowledgeBit } = await import("./knowledge-bit-triage-undo.repo.js");
const { handleUndoTriageKnowledgeBit } = await import("./knowledge-bit-triage-undo.controller.js");

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

describe("handleUndoTriageKnowledgeBit", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should restore the dropped variants and answer ok", async () => {
    vi.mocked(undoTriageKnowledgeBit).mockResolvedValue(true);
    const res = fakeRes();

    await handleUndoTriageKnowledgeBit(fakeReq({ restoreVariantIds: ["v1", "v2"] }), res, "kb_1");

    expect(undoTriageKnowledgeBit).toHaveBeenCalledWith("kb_1", ["v1", "v2"]);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("should answer 404 not_found when the piece does not exist", async () => {
    vi.mocked(undoTriageKnowledgeBit).mockResolvedValue("not_found");
    const res = fakeRes();

    await handleUndoTriageKnowledgeBit(fakeReq({ restoreVariantIds: ["v1"] }), res, "missing");

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: "not_found" });
  });

  it.each(["blocked", "variant_not_superseded", "slot_taken"] as const)(
    "should answer 409 %s when the repo refuses with that reason",
    async (reason) => {
      vi.mocked(undoTriageKnowledgeBit).mockResolvedValue(reason);
      const res = fakeRes();

      await handleUndoTriageKnowledgeBit(fakeReq({ restoreVariantIds: ["v1"] }), res, "kb_1");

      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ error: reason });
    },
  );

  it.each([[[]], [["a", "a"]], [Array.from({ length: 21 }, (_, index) => `v${index}`)]])(
    "should answer 400 invalid_input for %j and never touch the repo",
    async (restoreVariantIds) => {
      const res = fakeRes();

      await handleUndoTriageKnowledgeBit(fakeReq({ restoreVariantIds }), res, "kb_1");

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ error: "invalid_input" });
      expect(undoTriageKnowledgeBit).not.toHaveBeenCalled();
    },
  );
});
