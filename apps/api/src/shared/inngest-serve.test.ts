import http from "node:http";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createInngestServeHandler } from "./inngest-serve.js";
import { resolveCorsDecision } from "./cors.js";

const SECRET = "test-bearer-secret";

function makeTestServer(): http.Server {
  const inngestHandler = createInngestServeHandler([]);

  return http.createServer((req, res) => {
    const path = new URL(req.url ?? "/", "http://localhost").pathname;

    if (path === "/api/inngest") {
      inngestHandler(req, res);
      return;
    }

    const auth = req.headers["authorization"];

    if (auth !== `Bearer ${SECRET}`) {
      res.writeHead(401);
      res.end();
      return;
    }

    res.writeHead(200);
    res.end();
  });
}

function request(
  server: http.Server,
  path: string,
  headers?: Record<string, string>,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const { port } = server.address() as { port: number };
    const req = http.request(
      { host: "127.0.0.1", port, path, method: "GET", headers },
      (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      },
    );

    req.on("error", reject);
    req.end();
  });
}

describe("resolveCorsDecision with missing origin", () => {
  it("should return noOrigin (not forbidden) when no Origin header is present, so server-to-server calls like the Inngest dev server are not blocked by the CORS gate", () => {
    const decision = resolveCorsDecision({
      requestOrigin: undefined,
      webOrigin: "https://app.example.com",
      extensionId: undefined,
    });

    expect("forbidden" in decision).toBe(false);
    expect("noOrigin" in decision).toBe(true);
  });
});

describe("createInngestServeHandler", () => {
  let server: http.Server;

  beforeAll(
    () =>
      new Promise<void>((resolve) => {
        server = makeTestServer();
        server.listen(0, "127.0.0.1", () => resolve());
      }),
  );

  afterAll(
    () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  );

  it("should not return 401 for GET /api/inngest even without a bearer token", async () => {
    const status = await request(server, "/api/inngest");

    expect(status).not.toBe(401);
  });

  it("should return 401 for any other path when no bearer token is provided", async () => {
    const status = await request(server, "/api/subjects");

    expect(status).toBe(401);
  });

  it("should return 200 for a non-inngest path when a valid bearer token is provided", async () => {
    const status = await request(server, "/api/subjects", {
      authorization: `Bearer ${SECRET}`,
    });

    expect(status).toBe(200);
  });
});
