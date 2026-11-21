import { Readable } from "node:stream";
import type http from "node:http";
import { describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/db";
process.env.OPENROUTER_API_KEY ??= "test-key";
process.env.API_SHARED_SECRET = "the-shared-secret";
process.env.WEB_ORIGIN = "https://app.example.com";

const mocks = vi.hoisted(() => ({ run: vi.fn() }));

vi.mock("./db/client.js", () => ({ getDb: () => ({}) }));
vi.mock("./card-synthesis-mining/card-synthesis-mining-job.js", () => ({
  runCardSynthesisMining: mocks.run,
}));

const { createApiRequestListener } = await import("./api-server.js");

function post(url: string, authorization?: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve) => {
    let status = 0;
    let body = "";
    const finish: Array<() => void> = [];
    const req = Object.assign(Readable.from([]), {
      method: "POST",
      url,
      headers: { ...(authorization ? { authorization } : {}) },
    }) as unknown as http.IncomingMessage;
    const res = {
      headersSent: false,
      statusCode: 200,
      on: (event: string, handler: () => void) => {
        if (event === "finish") finish.push(handler);
      },
      setHeader: () => undefined,
      writeHead: (code: number) => {
        status = code;
      },
      end: (chunk?: string) => {
        body += chunk ?? "";
        finish.forEach((handler) => handler());
        resolve({ status, body });
      },
    } as unknown as http.ServerResponse;

    createApiRequestListener()(req, res);
  });
}

describe("POST /card-synthesis-mining auth", () => {
  it("should refuse a caller without the shared secret and never start a run", async () => {
    mocks.run.mockClear();

    const anonymous = await post("/card-synthesis-mining");

    expect(anonymous.status).toBe(401);
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it("should run the job for the shared secret and pass dryRun through", async () => {
    mocks.run.mockResolvedValue({ status: "disabled" });

    const res = await post("/card-synthesis-mining?dryRun=1&limit=2", "Bearer the-shared-secret");

    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ status: "disabled" });
    expect(mocks.run).toHaveBeenCalledWith({ dryRun: true, limit: 2 });
  });

  it("should answer 502 when the run throws", async () => {
    mocks.run.mockRejectedValue(new Error("boom"));

    const res = await post("/card-synthesis-mining", "Bearer the-shared-secret");

    expect(res.status).toBe(502);
  });

  it("should answer 400 for a malformed query", async () => {
    const res = await post("/card-synthesis-mining?limit=abc", "Bearer the-shared-secret");

    expect(res.status).toBe(400);
  });
});
