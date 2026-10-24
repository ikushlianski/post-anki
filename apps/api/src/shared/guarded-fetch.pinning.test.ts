import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { guardedFetchText } from "./guarded-fetch.js";

const mockLoadEnv = vi.hoisted(() => vi.fn());
const mockLookup = vi.hoisted(() => vi.fn());

vi.mock("node:dns/promises", () => ({ lookup: mockLookup }));

vi.mock("./env.js", () => ({
  loadEnv: mockLoadEnv,
}));

function page(body: string): Response {
  return new Response(body, { status: 200, headers: { "content-type": "text/html" } });
}

function redirectTo(location: string): Response {
  return new Response(null, { status: 302, headers: { location } });
}

interface FetchCall {
  url: string;
  dispatcher: unknown;
}

function stubFetch(handler: (url: string) => Response): FetchCall[] {
  const calls: FetchCall[] = [];

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      calls.push({ url: input, dispatcher: Reflect.get(init ?? {}, "dispatcher") });

      return handler(input);
    }),
  );

  return calls;
}

beforeEach(() => {
  mockLoadEnv.mockReset();
  mockLoadEnv.mockReturnValue({});
  mockLookup.mockReset();
  mockLookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("guardedFetchText address pinning", () => {
  it("should resolve a hostname once and hand that answer to the connection", async () => {
    const calls = stubFetch(() => page("ok"));

    mockLookup
      .mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }])
      .mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);

    const result = await guardedFetchText("https://rebind.example.com/");

    expect(result).toMatchObject({ ok: true });
    expect(mockLookup).toHaveBeenCalledTimes(1);
    expect(calls[0]!.dispatcher).toBeDefined();
  });

  it("should pin and validate every redirect hop with its own dispatcher", async () => {
    const calls = stubFetch((url) => (url.includes("first.example.com") ? redirectTo("https://second.example.com/") : page("ok")));

    const result = await guardedFetchText("https://first.example.com/");

    expect(result).toMatchObject({ ok: true, finalUrl: "https://second.example.com/" });
    expect(mockLookup).toHaveBeenCalledTimes(2);
    expect(calls).toHaveLength(2);
    expect(calls[0]!.dispatcher).toBeDefined();
    expect(calls[1]!.dispatcher).toBeDefined();
    expect(calls[0]!.dispatcher).not.toBe(calls[1]!.dispatcher);
  });

  it("should block a redirect hop whose hostname resolves to a private address", async () => {
    const calls = stubFetch(() => redirectTo("https://internal-looking.example.com/"));

    mockLookup
      .mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }])
      .mockResolvedValueOnce([{ address: "10.0.0.7", family: 4 }]);

    const result = await guardedFetchText("https://first.example.com/");

    expect(result).toMatchObject({ ok: false, outcome: "blocked", reason: "private_address" });
    expect(calls).toHaveLength(1);
  });

  it.each([
    "http://[::1]/",
    "http://[::ffff:127.0.0.1]/",
    "http://[::ffff:7f00:1]/",
    "http://[::ffff:a00:1]/",
    "http://[fd00::1]/",
    "http://[fe80::1]/",
  ])("should refuse the private IPv6 literal %s", async (url) => {
    const calls = stubFetch(() => page("internal"));

    expect(await guardedFetchText(url)).toMatchObject({ ok: false, outcome: "blocked" });
    expect(calls).toHaveLength(0);
  });

  it.each(["::ffff:10.0.0.1", "fd12:3456::1", "fe80::2", "::1"])(
    "should refuse a hostname that resolves to the private address %s",
    async (address) => {
      const calls = stubFetch(() => page("internal"));

      mockLookup.mockResolvedValue([{ address, family: 6 }]);

      expect(await guardedFetchText("https://v6.example.com/")).toMatchObject({
        ok: false,
        outcome: "blocked",
        reason: "private_address",
      });
      expect(calls).toHaveLength(0);
    },
  );

  it("should accept a hostname that resolves only to a public IPv6 address", async () => {
    const calls = stubFetch(() => page("ok"));

    mockLookup.mockResolvedValue([{ address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 }]);

    expect(await guardedFetchText("https://v6.example.com/")).toMatchObject({ ok: true });
    expect(calls[0]!.dispatcher).toBeDefined();
  });

  it("should give up with a network error when the DNS lookup outlasts the time limit", async () => {
    const calls = stubFetch(() => page("never"));

    mockLookup.mockReturnValue(new Promise(() => undefined));

    const result = await guardedFetchText("https://slow-dns.example.com/", { timeoutMs: 30 });

    expect(result).toEqual({ ok: false, outcome: "network_error" });
    expect(calls).toHaveLength(0);
  });

  it("should skip DNS for an IP-literal origin in the e2e allow-list and still pass a dispatcher", async () => {
    mockLoadEnv.mockReturnValue({
      E2E_SOURCE_FETCH_ALLOWED_ORIGINS: "http://127.0.0.1:9100",
    });

    const calls = stubFetch(() => page("ok"));

    const result = await guardedFetchText("http://127.0.0.1:9100/llms.txt");

    expect(result).toMatchObject({ ok: true });
    expect(mockLookup).not.toHaveBeenCalled();
    expect(calls[0]!.dispatcher).toBeDefined();
  });
});
