import type http from "node:http";
import { describe, expect, it, vi } from "vitest";
import { createLambdaHandler, loadSecretsFromSsm, type FunctionUrlEvent } from "./lambda-handler.js";

const echoListener: http.RequestListener = (req, res) => {
  const chunks: Buffer[] = [];

  req.on("data", (c: Buffer) => chunks.push(c));
  req.on("end", () => {
    res.setHeader("content-type", "application/json");
    res.setHeader("set-cookie", ["a=1", "b=2"]);
    res.writeHead(201);
    res.end(
      JSON.stringify({
        method: req.method,
        url: req.url,
        auth: req.headers.authorization,
        cookie: req.headers.cookie,
        body: Buffer.concat(chunks).toString("utf8"),
      }),
    );
  });
};

function event(overrides: Partial<FunctionUrlEvent> = {}): FunctionUrlEvent {
  return {
    rawPath: "/cards",
    rawQueryString: "limit=5",
    headers: { authorization: "Bearer t", "content-type": "application/json" },
    requestContext: { http: { method: "POST" } },
    ...overrides,
  };
}

describe("lambda function-url handler", () => {
  it("should deliver method, path, query, headers and body to the API listener and return its response", async () => {
    const handler = createLambdaHandler({ getListener: async () => echoListener });
    const result = await handler(event({ body: '{"q":1}', cookies: ["x=1", "y=2"] }));

    expect(result.statusCode).toBe(201);
    expect(result.isBase64Encoded).toBe(false);
    expect(result.cookies).toEqual(["a=1", "b=2"]);
    expect(JSON.parse(result.body)).toEqual({
      method: "POST",
      url: "/cards?limit=5",
      auth: "Bearer t",
      cookie: "x=1; y=2",
      body: '{"q":1}',
    });
  });

  it("should decode base64 request bodies before the API sees them", async () => {
    const handler = createLambdaHandler({ getListener: async () => echoListener });
    const result = await handler(
      event({ body: Buffer.from("héllo").toString("base64"), isBase64Encoded: true }),
    );

    expect(JSON.parse(result.body).body).toBe("héllo");
  });

  it("should return non-text responses as base64", async () => {
    const bytes = Buffer.from([0, 1, 2, 255]);
    const handler = createLambdaHandler({
      getListener: async () => (_req, res) => {
        res.setHeader("content-type", "application/octet-stream");
        res.end(bytes);
      },
    });
    const result = await handler(event({ requestContext: { http: { method: "GET" } } }));

    expect(result.isBase64Encoded).toBe(true);
    expect(Buffer.from(result.body, "base64")).toEqual(bytes);
  });

  it("should prepare secrets and build the listener only once across warm invocations", async () => {
    const prepare = vi.fn(async () => {});
    const getListener = vi.fn(async () => echoListener);
    const handler = createLambdaHandler({ prepare, getListener });

    await handler(event());
    await handler(event());

    expect(prepare).toHaveBeenCalledTimes(1);
    expect(getListener).toHaveBeenCalledTimes(1);
  });

  it("should retry startup on the next invocation when secret loading fails", async () => {
    const prepare = vi.fn().mockRejectedValueOnce(new Error("ssm_down")).mockResolvedValue(undefined);
    const handler = createLambdaHandler({ prepare, getListener: async () => echoListener });

    await expect(handler(event())).rejects.toThrow("ssm_down");
    await expect(handler(event())).resolves.toMatchObject({ statusCode: 201 });
  });

  it("should not call SSM when every mapped variable is already set", async () => {
    const env: NodeJS.ProcessEnv = { DATABASE_URL: "set" };

    await expect(loadSecretsFromSsm({ DATABASE_URL: "/p/db" }, env)).resolves.toBeUndefined();
    expect(env.DATABASE_URL).toBe("set");
  });
});
