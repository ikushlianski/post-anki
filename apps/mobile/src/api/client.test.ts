import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// expo-router and expo-secure-store cannot load outside a React Native runtime;
// the guard under test touches neither, so both are replaced at the module edge.
vi.mock("expo-router", () => ({ router: { replace: vi.fn() } }));

vi.mock("./token-storage", () => ({
  getStoredToken: vi.fn(),
  clearStoredToken: vi.fn(),
}));

import { apiBaseUrl, apiFetch, assertSecureUrl, verifyToken } from "./client";

const LOOPBACK_BASE_URLS = [
  "http://localhost:8030",
  "http://127.0.0.1:8030",
  "http://[::1]:8030",
  "http://10.0.2.2:8030",
];

describe("assertSecureUrl", () => {
  describe("plaintext http to a remote host", () => {
    it("rejects a plain http:// URL", () => {
      expect(() => assertSecureUrl("http://api.postanki.app")).toThrow(
        /plaintext HTTP to a non-local host/,
      );
    });

    it("rejects http:// regardless of scheme casing", () => {
      expect(() => assertSecureUrl("HTTP://api.postanki.app")).toThrow(
        /plaintext HTTP to a non-local host/,
      );
      expect(() => assertSecureUrl("HtTp://api.postanki.app")).toThrow(
        /plaintext HTTP to a non-local host/,
      );
    });

    it("rejects http:// when the path merely mentions a loopback host", () => {
      expect(() => assertSecureUrl("http://evil.com/localhost")).toThrow(
        /plaintext HTTP to a non-local host/,
      );
    });
  });

  describe("https", () => {
    it("accepts an https:// URL", () => {
      expect(() => assertSecureUrl("https://api.postanki.app")).not.toThrow();
      expect(() => assertSecureUrl("https://api.postanki.app/v1")).not.toThrow();
      expect(() => assertSecureUrl("https://api.postanki.app:8443")).not.toThrow();
    });

    it("accepts https:// regardless of scheme casing", () => {
      expect(() => assertSecureUrl("HTTPS://api.postanki.app")).not.toThrow();
    });
  });

  describe("loopback development exemption", () => {
    it.each(LOOPBACK_BASE_URLS)("accepts plaintext http to %s", (url) => {
      expect(() => assertSecureUrl(url)).not.toThrow();
    });

    it("accepts a loopback host without a port", () => {
      expect(() => assertSecureUrl("http://localhost")).not.toThrow();
    });

    it("accepts a loopback host regardless of casing", () => {
      expect(() => assertSecureUrl("http://LOCALHOST:8030")).not.toThrow();
    });

    it.each([
      "http://localhost.evil.com",
      "http://localhost.evil.com:8030",
      "http://127.0.0.1.evil.com",
      "http://10.0.2.2.evil.com",
      "http://localhosts",
      "http://notlocalhost",
      "http://evil-localhost.com",
    ])("rejects the lookalike host %s", (url) => {
      expect(() => assertSecureUrl(url)).toThrow(/plaintext HTTP to a non-local host/);
    });

    it("does not treat a non-loopback IPv6 literal as local", () => {
      expect(() => assertSecureUrl("http://[::ffff:127.0.0.1]")).toThrow(
        /plaintext HTTP to a non-local host/,
      );
    });
  });

  describe("embedded userinfo", () => {
    it("rejects a loopback host smuggled in as userinfo", () => {
      expect(() => assertSecureUrl("http://localhost@evil.com")).toThrow(/embedded userinfo/);
      expect(() => assertSecureUrl("http://localhost:8030@evil.com")).toThrow(/embedded userinfo/);
    });

    it("rejects userinfo on https too, rather than parsing it", () => {
      expect(() => assertSecureUrl("https://user:pass@api.postanki.app")).toThrow(
        /embedded userinfo/,
      );
    });
  });

  describe("malformed input", () => {
    it.each(["", "   ", "not a url", "localhost:8030", "//localhost:8030", "http://", "http:///v1"])(
      "refuses to accept the unparseable input %j",
      (url) => {
        expect(() => assertSecureUrl(url)).toThrow(/Cannot parse API base URL/);
      },
    );

    it("refuses a URL with leading whitespace rather than trimming it", () => {
      expect(() => assertSecureUrl("  http://evil.com")).toThrow(/Cannot parse API base URL/);
    });
  });

  describe("schemes that are neither http nor https", () => {
    it.each([
      "ws://evil.com",
      "wss://evil.com",
      "ftp://evil.com",
      "file://evil.com",
      "gopher://evil.com",
    ])("rejects %j rather than letting it through for not being http", (url) => {
      expect(() => assertSecureUrl(url)).toThrow(/non-HTTPS scheme/);
    });

    it("rejects a non-https scheme even on a loopback host", () => {
      expect(() => assertSecureUrl("ws://localhost:8030")).toThrow(/non-HTTPS scheme/);
    });
  });
});

describe("network call sites", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("uses a base URL that the guard accepts by default", () => {
    expect(() => assertSecureUrl(apiBaseUrl())).not.toThrow();
  });

  it("stops verifyToken before the token reaches an insecure endpoint", async () => {
    vi.stubEnv("EXPO_PUBLIC_API_BASE_URL", "http://api.postanki.app");

    await expect(verifyToken("secret-token")).rejects.toThrow(
      /plaintext HTTP to a non-local host/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stops apiFetch before the token reaches an insecure endpoint", async () => {
    vi.stubEnv("EXPO_PUBLIC_API_BASE_URL", "http://api.postanki.app");

    await expect(apiFetch("/daily-push")).rejects.toThrow(/plaintext HTTP to a non-local host/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
