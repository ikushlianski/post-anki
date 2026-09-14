import { describe, expect, it } from "vitest";
import { assertSecureUrl } from "./secure-url.js";

const LOOPBACK_BASE_URLS = ["http://localhost:5560", "http://127.0.0.1:5560", "http://[::1]:5560"];

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
      expect(() => assertSecureUrl("http://LOCALHOST:5560")).not.toThrow();
    });

    it.each([
      "http://localhost.evil.com",
      "http://127.0.0.1.evil.com",
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
    });

    it("rejects userinfo on https too, rather than parsing it", () => {
      expect(() => assertSecureUrl("https://user:pass@api.postanki.app")).toThrow(
        /embedded userinfo/,
      );
    });
  });

  describe("malformed input", () => {
    it.each(["", "   ", "not a url", "localhost:5560", "//localhost:5560", "http://", "http:///v1"])(
      "refuses to accept the unparseable input %j",
      (url) => {
        expect(() => assertSecureUrl(url)).toThrow(/Cannot parse API base URL/);
      },
    );
  });

  describe("schemes that are neither http nor https", () => {
    it.each(["ws://evil.com", "wss://evil.com", "ftp://evil.com"])(
      "rejects the scheme %s",
      (url) => {
        expect(() => assertSecureUrl(url)).toThrow(/non-HTTPS scheme/);
      },
    );
  });
});
