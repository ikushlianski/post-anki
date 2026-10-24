import { Readable } from "node:stream";
import type http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./knowledge-bit-triage.repo.js", () => ({ triageKnowledgeBit: vi.fn() }));

const { triageKnowledgeBit } = await import("./knowledge-bit-triage.repo.js");
const { handleTriageKnowledgeBit } = await import("./knowledge-bit-triage.controller.js");

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

describe("handleTriageKnowledgeBit", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should approve the piece with the chosen variants and answer ok", async () => {
    vi.mocked(triageKnowledgeBit).mockResolvedValue({ ok: true, droppedVariantIds: ["v3"] });
    const res = fakeRes();

    await handleTriageKnowledgeBit(fakeReq({ keepVariantIds: ["v1", "v2"] }), res, "kb_1");

    expect(triageKnowledgeBit).toHaveBeenCalledWith("kb_1", ["v1", "v2"]);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, droppedVariantIds: ["v3"] });
  });

  it("should answer 404 not_found when the piece does not exist", async () => {
    vi.mocked(triageKnowledgeBit).mockResolvedValue("not_found");
    const res = fakeRes();

    await handleTriageKnowledgeBit(fakeReq({ keepVariantIds: ["v1"] }), res, "missing");

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: "not_found" });
  });

  it.each(["blocked", "no_variant", "variant_not_active"] as const)(
    "should answer 409 %s when the repo refuses with that reason",
    async (reason) => {
      vi.mocked(triageKnowledgeBit).mockResolvedValue(reason);
      const res = fakeRes();

      await handleTriageKnowledgeBit(fakeReq({ keepVariantIds: ["v1"] }), res, "kb_1");

      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ error: reason });
    },
  );

  it.each([[[]], [["a", "b", "c"]]])(
    "should answer 400 invalid_input for %j and never touch the repo",
    async (keepVariantIds) => {
      const res = fakeRes();

      await handleTriageKnowledgeBit(fakeReq({ keepVariantIds }), res, "kb_1");

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ error: "invalid_input" });
      expect(triageKnowledgeBit).not.toHaveBeenCalled();
    },
  );
});
