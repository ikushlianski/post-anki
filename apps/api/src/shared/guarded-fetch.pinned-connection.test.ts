import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { guardedFetchText } from "./guarded-fetch.js";

const mockLoadEnv = vi.hoisted(() => vi.fn());
const mockLookup = vi.hoisted(() => vi.fn());

vi.mock("node:dns/promises", () => ({ lookup: mockLookup }));

vi.mock("./env.js", () => ({
  loadEnv: mockLoadEnv,
}));

let server: http.Server;
let port: number;
let hostHeaders: (string | undefined)[];

beforeEach(async () => {
  hostHeaders = [];
  server = http.createServer((req, res) => {
    hostHeaders.push(req.headers.host);
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("served by the pinned address");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
  mockLookup.mockReset();
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("guardedFetchText real connection", () => {
  it("should connect to the address it validated even when a later lookup would answer differently", async () => {
    mockLoadEnv.mockReturnValue({ E2E_SOURCE_FETCH_ALLOWED_ORIGINS: `http://pin.test:${port}`, NODE_ENV: "test" });
    mockLookup
      .mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }])
      .mockResolvedValue([{ address: "203.0.113.9", family: 4 }]);

    const result = await guardedFetchText(`http://pin.test:${port}/page`);

    expect(result).toMatchObject({ ok: true, text: "served by the pinned address" });
    expect(mockLookup).toHaveBeenCalledTimes(1);
    expect(hostHeaders).toEqual([`pin.test:${port}`]);
  });

  it("should not reach a loopback server in production even when its origin is listed", async () => {
    mockLoadEnv.mockReturnValue({ E2E_SOURCE_FETCH_ALLOWED_ORIGINS: `http://pin.test:${port}`, NODE_ENV: "production" });
    mockLookup.mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);

    const result = await guardedFetchText(`http://pin.test:${port}/page`);

    expect(result).toMatchObject({ ok: false, outcome: "blocked", reason: "private_address" });
    expect(hostHeaders).toEqual([]);
  });
});
