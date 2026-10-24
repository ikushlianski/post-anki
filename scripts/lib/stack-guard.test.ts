import { describe, expect, it } from "vitest";

import { resolveCheckTarget } from "./stack-guard.mjs";

describe("resolveCheckTarget", () => {
  it("should default browser checks to the isolated stack so the user's dev data is never touched", () => {
    const target = resolveCheckTarget({ argv: ["--seed"], env: {} });

    expect(target).toEqual({
      ok: true,
      base: "http://localhost:5550",
      container: "post-anki-e2e-db",
      database: "postanki_e2e",
      useDevApp: false,
    });
  });

  it("should refuse the dev web port unless the user explicitly allows the dev app", () => {
    const target = resolveCheckTarget({ argv: [], env: { APP_URL: "http://localhost:5540" } });

    expect(target.ok).toBe(false);
  });

  it("should refuse the dev API port", () => {
    expect(resolveCheckTarget({ argv: [], env: { APP_URL: "http://localhost:5560" } }).ok).toBe(false);
  });

  it("should refuse the dev database container even when the URL looks isolated", () => {
    const target = resolveCheckTarget({ argv: [], env: { CHECK_DB_CONTAINER: "post-anki-dev-db" } });

    expect(target.ok).toBe(false);
  });

  it("should refuse the dev database name even when the container differs", () => {
    expect(resolveCheckTarget({ argv: [], env: { CHECK_DB_NAME: "postanki_dev" } }).ok).toBe(false);
  });

  it("should allow a read-only look at the dev app when --use-dev-app is given", () => {
    const target = resolveCheckTarget({ argv: ["--use-dev-app"], env: {} });

    expect(target).toMatchObject({ ok: true, base: "http://localhost:5540", container: "post-anki-dev-db" });
  });

  it("should never allow seeding test data into the dev app", () => {
    expect(resolveCheckTarget({ argv: ["--use-dev-app", "--seed"], env: {} }).ok).toBe(false);
  });

  it.each([
    ["a proxy host on port 80", "http://dev.example.com"],
    ["a proxy host on port 443", "https://dev.example.com"],
    ["a host with no scheme", "localhost:5540"],
    ["an uppercase dev host", "HTTP://LOCALHOST:5540"],
    ["a trailing-dot host on the isolated port", "http://localhost.:5550"],
    ["userinfo that hides the real host", "http://localhost:5550@evil.example.com"],
    ["userinfo in front of the isolated host", "http://user:pw@localhost:5550"],
    ["the IPv6 loopback on the dev port", "http://[::1]:5540"],
    ["the IPv6 loopback on the isolated port", "http://[::1]:5550"],
    ["a non-http protocol", "ftp://localhost:5550"],
    ["a file URL", "file:///tmp/x"],
    ["a different isolated-looking port", "http://localhost:5551"],
  ])("should refuse %s", (_label, appUrl) => {
    expect(resolveCheckTarget({ argv: [], env: { APP_URL: appUrl } }).ok).toBe(false)
  });

  it("should accept the isolated origin written in uppercase or with a path, normalised to the real origin", () => {
    expect(resolveCheckTarget({ argv: [], env: { APP_URL: "HTTP://LOCALHOST:5550/add-knowledge" } })).toMatchObject({
      ok: true,
      base: "http://localhost:5550",
    })
  });

  it("should accept the isolated stack on 127.0.0.1", () => {
    expect(resolveCheckTarget({ argv: [], env: { APP_URL: "http://127.0.0.1:5550" } }).ok).toBe(true)
  });

  it.each([
    ["a container id prefix of the dev container", "a1b2c3d4e5f6"],
    ["a name that only starts with the isolated name", "post-anki-e2e-db-2"],
    ["a name that only ends with the isolated name", "x-post-anki-e2e-db"],
    ["the dev container", "post-anki-dev-db"],
  ])("should refuse %s as the database container", (_label, container) => {
    expect(resolveCheckTarget({ argv: [], env: { CHECK_DB_CONTAINER: container } }).ok).toBe(false)
  });

  it.each(["postanki_e2e_copy", "postanki", "postanki_dev", "POSTANKI_E2E"])("should refuse the database name %s", (name) => {
    expect(resolveCheckTarget({ argv: [], env: { CHECK_DB_NAME: name } }).ok).toBe(false)
  });

  it("should only allow the exact dev app triple with --use-dev-app, not a proxy in front of it", () => {
    expect(resolveCheckTarget({ argv: ["--use-dev-app"], env: { APP_URL: "https://dev.example.com" } }).ok).toBe(false)
  });
});
