import type http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getKnowledgeSourceText = vi.fn();

vi.mock("./knowledge-source-text.repo.js", () => ({
  getKnowledgeSourceText: (...args: unknown[]) => getKnowledgeSourceText(...args),
}));

const { handleGetKnowledgeSourceText } = await import("./knowledge-source-text.controller.js");

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

describe("handleGetKnowledgeSourceText", () => {
  beforeEach(() => {
    getKnowledgeSourceText.mockReset();
  });

  it("should return the stored text of an existing source", async () => {
    getKnowledgeSourceText.mockResolvedValue("Redis хранит данные в памяти.");
    const res = fakeRes();

    await handleGetKnowledgeSourceText(res as unknown as http.ServerResponse, "ks_abc-123");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ text: "Redis хранит данные в памяти." });
    expect(getKnowledgeSourceText).toHaveBeenCalledWith("ks_abc-123");
  });

  it("should answer 404 when the source is missing or has no text", async () => {
    getKnowledgeSourceText.mockResolvedValue(null);
    const res = fakeRes();

    await handleGetKnowledgeSourceText(res as unknown as http.ServerResponse, "ks_missing");

    expect(res.status).toBe(404);
  });

  it("should reject an id with characters outside the id alphabet before touching the database", async () => {
    const res = fakeRes();

    await handleGetKnowledgeSourceText(res as unknown as http.ServerResponse, "ks_1'; drop table x;--");

    expect(res.status).toBe(400);
    expect(getKnowledgeSourceText).not.toHaveBeenCalled();
  });
});
