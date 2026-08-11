import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { guardedFetchText, MAX_REDIRECTS } from "./guarded-fetch.js";

const mockLoadEnv = vi.hoisted(() => vi.fn());

vi.mock("./env.js", () => ({
  loadEnv: mockLoadEnv,
}));

function redirectTo(location: string): Response {
  return new Response(null, { status: 302, headers: { location } });
}

function page(body: string): Response {
  return new Response(body, { status: 200, headers: { "content-type": "text/html" } });
}

function stubFetch(handler: (url: string) => Response): ReturnType<typeof vi.fn> {
  const spy = vi.fn(async (input: string) => handler(input));

  vi.stubGlobal("fetch", spy);

  return spy;
}

beforeEach(() => {
  mockLoadEnv.mockReset();
  mockLoadEnv.mockReturnValue({});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("guardedFetchText", () => {
  describe("a source the learner is allowed to fetch", () => {
    it("returns the page text", async () => {
      stubFetch(() => page("<p>hello</p>"));

      const result = await guardedFetchText("https://react.dev/learn");

      expect(result).toMatchObject({
        ok: true,
        finalUrl: "https://react.dev/learn",
        text: "<p>hello</p>",
        truncated: false,
      });
    });

    it("surfaces the HTTP status when the site answers with an error", async () => {
      stubFetch(() => new Response("nope", { status: 404 }));

      expect(await guardedFetchText("https://react.dev/gone")).toMatchObject({
        ok: false,
        outcome: "http_error",
        status: 404,
      });
    });

    it("reports a network failure without throwing at the caller", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          throw new Error("connection reset");
        }),
      );

      expect(await guardedFetchText("https://react.dev/learn")).toMatchObject({
        ok: false,
        outcome: "network_error",
      });
    });
  });

  describe("a hostile source", () => {
    it("never touches the network for a non-http scheme", async () => {
      const spy = stubFetch(() => page("x"));

      const result = await guardedFetchText("javascript:alert(1)");

      expect(spy).not.toHaveBeenCalled();
      expect(result).toMatchObject({ ok: false, outcome: "blocked", reason: "unsupported_scheme" });
    });

    it("never touches the network for a private address", async () => {
      const spy = stubFetch(() => page("x"));

      const result = await guardedFetchText("http://169.254.169.254/computeMetadata/v1/");

      expect(spy).not.toHaveBeenCalled();
      expect(result).toMatchObject({ ok: false, outcome: "blocked", reason: "private_address" });
    });

    it("tells the caller which address was refused and why", async () => {
      stubFetch(() => page("x"));

      const result = await guardedFetchText("http://192.168.0.1/admin");

      expect(result).toMatchObject({ ok: false, blockedUrl: "http://192.168.0.1/admin" });
      expect(result.ok === false && result.outcome === "blocked" && result.message).toBeTruthy();
    });
  });

  describe("a permitted source that redirects", () => {
    it("follows a redirect to another public page", async () => {
      const spy = stubFetch((url) =>
        url === "https://react.dev/old" ? redirectTo("/new") : page("moved here"),
      );

      const result = await guardedFetchText("https://react.dev/old");

      expect(spy).toHaveBeenCalledTimes(2);
      expect(result).toMatchObject({ ok: true, finalUrl: "https://react.dev/new" });
    });

    it("refuses a redirect that lands on the cloud metadata service", async () => {
      const spy = stubFetch((url) =>
        url === "https://evil.example.com/start"
          ? redirectTo("http://169.254.169.254/computeMetadata/v1/")
          : page("secrets"),
      );

      const result = await guardedFetchText("https://evil.example.com/start");

      expect(spy).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({
        ok: false,
        outcome: "blocked",
        reason: "private_address",
        blockedUrl: "http://169.254.169.254/computeMetadata/v1/",
      });
    });

    it("gives up on a redirect loop instead of following it forever", async () => {
      const spy = stubFetch(() => redirectTo("/again"));

      expect(await guardedFetchText("https://react.dev/loop")).toMatchObject({
        ok: false,
        outcome: "too_many_redirects",
      });
      expect(spy).toHaveBeenCalledTimes(MAX_REDIRECTS + 1);
    });

    it("treats a redirect with no destination as an HTTP error", async () => {
      stubFetch(() => new Response(null, { status: 302 }));

      expect(await guardedFetchText("https://react.dev/old")).toMatchObject({
        ok: false,
        outcome: "http_error",
        status: 302,
      });
    });
  });

  describe("the local mock sites an e2e run points at", () => {
    it("reaches a loopback origin the e2e stage has explicitly exempted", async () => {
      mockLoadEnv.mockReturnValue({
        E2E_SOURCE_FETCH_ALLOWED_ORIGINS: "http://localhost:4998,http://localhost:4997",
      });
      const spy = stubFetch(() => page("# llms.txt"));

      const result = await guardedFetchText("http://localhost:4998/llms.txt");

      expect(spy).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({ ok: true, text: "# llms.txt" });
    });

    it("still refuses a loopback origin that was not exempted", async () => {
      mockLoadEnv.mockReturnValue({
        E2E_SOURCE_FETCH_ALLOWED_ORIGINS: "http://localhost:4998",
      });
      stubFetch(() => page("x"));

      expect(await guardedFetchText("http://localhost:9999/secret")).toMatchObject({
        ok: false,
        outcome: "blocked",
      });
    });

    it("never exempts a non-http scheme, whatever the allowlist says", async () => {
      mockLoadEnv.mockReturnValue({ E2E_SOURCE_FETCH_ALLOWED_ORIGINS: "http://localhost:4998" });
      const spy = stubFetch(() => page("x"));

      expect(await guardedFetchText("file:///etc/passwd")).toMatchObject({
        ok: false,
        outcome: "blocked",
        reason: "unsupported_scheme",
      });
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe("an oversized response", () => {
    it("stops reading at the byte cap and says the text was cut short", async () => {
      stubFetch(() => page("a".repeat(5_000)));

      const result = await guardedFetchText("https://react.dev/huge", {
        maxResponseBytes: 100,
      });

      expect(result).toMatchObject({ ok: true, truncated: true });
      expect(result.ok === true && result.text.length).toBe(100);
    });
  });
});
