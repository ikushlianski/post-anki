import { describe, expect, it } from "vitest";
import { isSafeSourceUrl } from "./source-url";

function reasonFor(url: string): string | null {
  const verdict = isSafeSourceUrl(url);

  return verdict.allowed ? null : verdict.reason;
}

describe("isSafeSourceUrl", () => {
  describe("ordinary public links a learner would paste", () => {
    it("allows a plain https article link", () => {
      expect(isSafeSourceUrl("https://react.dev/learn/thinking-in-react")).toEqual({
        allowed: true,
        url: "https://react.dev/learn/thinking-in-react",
      });
    });

    it("allows a plain http link, since many docs sites still redirect from it", () => {
      expect(isSafeSourceUrl("http://example.com/post").allowed).toBe(true);
    });

    it("allows a public address that only looks close to a private range", () => {
      expect(isSafeSourceUrl("http://172.32.0.1/").allowed).toBe(true);
      expect(isSafeSourceUrl("http://11.0.0.1/").allowed).toBe(true);
      expect(isSafeSourceUrl("http://192.169.0.1/").allowed).toBe(true);
    });

    it("allows a public IPv6 literal", () => {
      expect(isSafeSourceUrl("https://[2606:4700:4700::1111]/").allowed).toBe(true);
    });
  });

  describe("addresses that are not fetchable at all", () => {
    it("rejects text that is not a web address", () => {
      expect(reasonFor("not a url")).toBe("malformed_url");
      expect(reasonFor("")).toBe("malformed_url");
      expect(reasonFor("https://")).toBe("malformed_url");
    });

    it("explains that only http and https can be fetched", () => {
      const verdict = isSafeSourceUrl("javascript:alert(1)");

      expect(verdict.allowed).toBe(false);
      expect(verdict.allowed === false && verdict.reason).toBe("unsupported_scheme");
      expect(verdict.allowed === false && verdict.message).toContain("http");
    });

    it("rejects every other scheme a hostile paste could use", () => {
      expect(reasonFor("data:text/html,<script>alert(1)</script>")).toBe("unsupported_scheme");
      expect(reasonFor("file:///etc/passwd")).toBe("unsupported_scheme");
      expect(reasonFor("ftp://example.com/x")).toBe("unsupported_scheme");
      expect(reasonFor("gopher://example.com:70/x")).toBe("unsupported_scheme");
      expect(reasonFor("vbscript:msgbox(1)")).toBe("unsupported_scheme");
    });
  });

  describe("addresses that would reach our own infrastructure", () => {
    it("rejects loopback in every notation a browser accepts", () => {
      expect(reasonFor("http://127.0.0.1/")).toBe("private_address");
      expect(reasonFor("http://127.1/")).toBe("private_address");
      expect(reasonFor("http://2130706433/")).toBe("private_address");
      expect(reasonFor("http://0x7f000001/")).toBe("private_address");
      expect(reasonFor("http://0177.0.0.1/")).toBe("private_address");
      expect(reasonFor("http://[::1]/")).toBe("private_address");
    });

    it("rejects the cloud metadata endpoint by address and by name", () => {
      expect(reasonFor("http://169.254.169.254/computeMetadata/v1/")).toBe("private_address");
      expect(reasonFor("http://[::ffff:169.254.169.254]/")).toBe("private_address");
      expect(reasonFor("http://metadata.google.internal/")).toBe("blocked_host");
    });

    it("rejects the private IPv4 ranges", () => {
      expect(reasonFor("http://10.0.0.5/")).toBe("private_address");
      expect(reasonFor("http://172.16.0.1/")).toBe("private_address");
      expect(reasonFor("http://172.31.255.254/")).toBe("private_address");
      expect(reasonFor("http://192.168.1.1/")).toBe("private_address");
    });

    it("rejects the unspecified address, which routes to the local host", () => {
      expect(reasonFor("http://0.0.0.0/")).toBe("private_address");
      expect(reasonFor("http://[::]/")).toBe("private_address");
    });

    it("rejects unique-local and link-local IPv6", () => {
      expect(reasonFor("http://[fc00::1]/")).toBe("private_address");
      expect(reasonFor("http://[fd12:3456::1]/")).toBe("private_address");
      expect(reasonFor("http://[fe80::1]/")).toBe("private_address");
    });

    it("rejects internal host names, including a bare machine name with no domain", () => {
      expect(reasonFor("http://localhost:3000/")).toBe("blocked_host");
      expect(reasonFor("http://LOCALHOST/")).toBe("blocked_host");
      expect(reasonFor("http://app.localhost/")).toBe("blocked_host");
      expect(reasonFor("http://printer.local/")).toBe("blocked_host");
      expect(reasonFor("http://redis/")).toBe("blocked_host");
      expect(reasonFor("http://vault.internal/")).toBe("blocked_host");
    });

    it("rejects an unparseable IPv6 literal rather than letting it through", () => {
      expect(isSafeSourceUrl("http://[1:2:3::4::5]/").allowed).toBe(false);
      expect(isSafeSourceUrl("http://[zzzz::1]/").allowed).toBe(false);
    });
  });

  describe("the rejection a caller shows the learner", () => {
    it("always carries a reason and a message, never a bare false", () => {
      const verdict = isSafeSourceUrl("http://192.168.0.1/");

      expect(verdict.allowed).toBe(false);
      expect(verdict.allowed === false && verdict.message.length).toBeGreaterThan(0);
    });
  });
});
